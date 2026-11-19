import { db } from "@/db";
import { transactions, users, wallets } from "@/db/schema";
import { requireUser } from "@/lib/server/session";
import { initiatePayment, newReference, publicAppUrl, toMpesaPhone } from "@/lib/server/payhero";
import { creditWallet, getActiveCurrency, listWallets } from "@/lib/server/wallet";
import { getSettings } from "@/lib/server/settings";
import { getCurrency, CURRENCIES } from "@/lib/currency";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const MOBILE_MONEY: Record<string, "m-pesa" | "airtel" | null> = {
  "M-PESA": "m-pesa",
  MPESA: "m-pesa",
  "AIRTEL MONEY": "airtel",
  AIRTEL: "airtel",
  "MTN MOMO": null,
  "VODAFONE CASH": null,
  "BANK TRANSFER": null,
  USSD: null,
  EFT: null,
  UPI: null,
  PIX: null,
  "VISA / MASTERCARD": null,
  "CRYPTO (USDT)": null,
  "CRYPTO (BTC)": null,
  "CRYPTO (ETH)": null,
};

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const settings = await getSettings();
  const active = await getActiveCurrency(auth.user.id);
  const currency = String(body.currency ?? active).toUpperCase();
  const amount = Number(body.amount);
  const method = String(body.method ?? "").toUpperCase().trim();

  if (!settings.enabledCurrencies.includes(currency) || !CURRENCIES.some((c) => c.code === currency)) {
    return Response.json({ error: "That currency account is not available." }, { status: 400 });
  }
  const ccy = getCurrency(currency);
  const allowed = ccy.methods.includes(method) || method in MOBILE_MONEY;
  if (!allowed) {
    return Response.json({ error: `Choose one of: ${ccy.methods.join(", ")}.` }, { status: 400 });
  }
  const min = currency === "KES" ? 50 : Math.max(0.01, 50 / 129);
  const max = currency === "KES" ? 500000 : Math.max(1, 500000 / 129);
  if (!Number.isFinite(amount) || amount < min || amount > max) {
    return Response.json({ error: `Deposit must be between ${min} and ${max.toLocaleString()} ${currency}.` }, { status: 400 });
  }

  const reference = newReference("AVDEP");
  const provider = MOBILE_MONEY[method] ?? null;

  /* ---------------- KES mobile money goes through the live PayHero gateway ---------------- */
  if (currency === "KES" && (provider === "m-pesa" || provider === "airtel")) {
    const phoneInput = String(body.phone ?? auth.user.phone);
    const mpesa = toMpesaPhone(phoneInput);
    if (!mpesa) return Response.json({ error: "Enter a valid mobile money number, e.g. 0712 345 678." }, { status: 400 });
    const callbackUrl = `${publicAppUrl(req)}/api/webhooks/payhero`;

    const [row] = await db
      .insert(transactions)
      .values({
        userId: auth.user.id,
        type: "deposit",
        amount: amount.toFixed(2),
        currency,
        balanceAfter: "0.00",
        status: "pending",
        method,
        reference,
        gateway: "PENDING",
        note: `STK push sent to ${mpesa.slice(0, 4)}***${mpesa.slice(-3)} — waiting for confirmation`,
      })
      .returning({ id: transactions.id });

    const result = await initiatePayment({ phone: mpesa, amount, reference, name: auth.user.name, callbackUrl, provider });
    if (!result.ok) {
      await db.update(transactions).set({ status: "rejected", note: result.message ?? "Gateway declined." }).where(eq(transactions.id, row.id));
      return Response.json({ error: result.message ?? "We could not reach the payment gateway. Try again." }, { status: 502 });
    }
    await db
      .update(transactions)
      .set({ gateway: result.gateway, gatewayRef: result.gatewayRef ?? null })
      .where(eq(transactions.id, row.id));

    return Response.json({ ok: true, mode: "stk", reference, transactionId: row.id, gateway: result.gateway, phone: mpesa, amount, currency, state: result.state });
  }

  /* ---------------- all other rails settle instantly (card / crypto / bank) ---------------- */
  const credited = await creditWallet(auth.user.id, amount, currency);
  await db.insert(transactions).values({
    userId: auth.user.id,
    type: "deposit",
    amount: amount.toFixed(2),
    currency,
    balanceAfter: credited.balance.toFixed(2),
    status: "completed",
    method,
    reference,
    gateway: "INSTANT",
    note: `Deposit via ${method}`,
  });
  const walletRows = await listWallets(auth.user.id);
  const [u] = await db.select().from(users).where(eq(users.id, auth.user.id));
  return Response.json({
    ok: true,
    mode: "instant",
    reference,
    amount,
    currency,
    balance: credited.balance,
    wallets: walletRows,
    active: u?.currency ?? currency,
  });
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const rows = await db
    .select({ currency: wallets.currency, balance: wallets.balance })
    .from(wallets)
    .where(and(eq(wallets.userId, auth.user.id)));
  return Response.json({ ok: true, wallets: rows.map((r) => ({ currency: r.currency, balance: Number(r.balance) })) });
}
