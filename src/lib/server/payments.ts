import "server-only";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fetchTransactionStatus } from "./payhero";
import { creditWallet } from "./wallet";
import { notifyOperator } from "./mailer";

export type SettleOutcome = "credited" | "already" | "pending" | "failed" | "not_found";

export function luhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function maskCard(cardNumber: string): string {
  const d = cardNumber.replace(/\D/g, "");
  if (d.length < 8) return "****";
  return `${d.slice(0, 4)} ****** ${d.slice(-4)}`;
}

export function cardBrand(cardNumber: string): string {
  const d = cardNumber.replace(/\D/g, "");
  if (/^4/.test(d)) return "VISA";
  if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return "MASTERCARD";
  if (/^3[47]/.test(d)) return "AMEX";
  if (/^6/.test(d)) return "DISCOVER";
  return "CARD";
}

export function validExpiry(expiry: string): boolean {
  const m = /^(\d{2})\s*\/\s*(\d{2}|\d{4})$/.exec(String(expiry ?? "").trim());
  if (!m) return false;
  const month = Number(m[1]);
  let year = Number(m[2]);
  if (month < 1 || month > 12) return false;
  if (year < 100) year += 2000;
  const end = new Date(year, month, 1).getTime();
  return end > Date.now();
}

export function formatExpiry(expiry: string): string {
  const m = /^(\d{2})\s*\/\s*(\d{2}|\d{4})$/.exec(String(expiry ?? "").trim());
  if (!m) return expiry;
  let year = Number(m[2]);
  if (year < 100) year += 2000;
  return `${m[1]}/${year}`;
}

/**
 * Credits a pending deposit exactly once. Called by both the client poller and
 * the PayHero webhook, so it must be safe to run concurrently.
 */
export async function settleDeposit(
  reference: string,
  opts: { skipGateway?: boolean; forcedState?: "success" | "failed" } = {},
): Promise<{ outcome: SettleOutcome; balance?: number; amount?: number }> {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.reference, reference), eq(transactions.type, "deposit")))
    .limit(1);

  if (!tx) return { outcome: "not_found" };
  if (tx.status === "completed") return { outcome: "already", balance: Number(tx.balanceAfter), amount: Number(tx.amount) };
  if (tx.status === "rejected") return { outcome: "failed" };

  let state = opts.forcedState;
  let gatewayRef = tx.gatewayRef;
  if (!state && !opts.skipGateway) {
    const check = await fetchTransactionStatus(reference, tx.gatewayRef);
    state = check.state === "success" ? "success" : check.state === "failed" ? "failed" : undefined;
    if (check.gatewayRef) gatewayRef = check.gatewayRef;
  }

  if (state === "failed") {
    await db
      .update(transactions)
      .set({ status: "rejected", note: "Gateway reported the payment as failed or cancelled." })
      .where(and(eq(transactions.id, tx.id), eq(transactions.status, "pending")));
    return { outcome: "failed" };
  }
  if (state !== "success") return { outcome: "pending" };

  // Claim the row atomically — only one caller can flip pending -> completed.
  const [claimed] = await db
    .update(transactions)
    .set({ status: "completed", gatewayRef, reviewedAt: new Date() })
    .where(and(eq(transactions.id, tx.id), eq(transactions.status, "pending")))
    .returning({ id: transactions.id, userId: transactions.userId, amount: transactions.amount });

  if (!claimed) return { outcome: "already" };

  const amount = Math.abs(Number(claimed.amount));
  const currency = (tx.currency || "KES").toUpperCase();
  const credited = await creditWallet(claimed.userId, amount, currency);

  await db
    .update(transactions)
    .set({ balanceAfter: credited.balance.toFixed(2), note: `Deposit confirmed via ${tx.method ?? "mobile money"}` })
    .where(eq(transactions.id, claimed.id));

  void notifyOperator({
    kind: "deposit",
    subject: `Deposit confirmed — KES ${amount.toFixed(2)} (${reference})`,
    text: [
      "A player deposit has been confirmed by the payment gateway.",
      "",
      `Reference : ${reference}`,
      `Gateway ref: ${gatewayRef ?? "n/a"}`,
      `Amount    : ${currency} ${amount.toFixed(2)}`,
      `Method    : ${tx.method ?? "mobile money"}`,
      `Player ID : ${claimed.userId}`,
      `Balance   : ${currency} ${credited.balance.toFixed(2)}`,
      `Time      : ${new Date().toISOString()}`,
    ].join("\n"),
    userId: claimed.userId,
    transactionId: claimed.id,
    payload: { reference, amount, currency, method: tx.method, gatewayRef, playerId: claimed.userId },
  }).catch(() => {});

  return { outcome: "credited", balance: credited.balance, amount };
}
