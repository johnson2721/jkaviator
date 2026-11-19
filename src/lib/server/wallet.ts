import "server-only";
import { db } from "@/db";
import { users, wallets } from "@/db/schema";
import { getSettings } from "./settings";
import { and, eq, sql } from "drizzle-orm";
import { CURRENCIES } from "@/lib/currency";

export type WalletRow = { currency: string; balance: number; bonusBalance: number };

export async function enabledCurrencies(): Promise<string[]> {
  const s = await getSettings();
  const list = s.enabledCurrencies?.length ? s.enabledCurrencies : ["KES"];
  return list.filter((c) => CURRENCIES.some((k) => k.code === c.toUpperCase()));
}

/** Creates one wallet per enabled currency for a player. */
export async function ensureWallets(userId: number, primary?: string): Promise<void> {
  const list = await enabledCurrencies();
  const codes = primary ? Array.from(new Set([primary.toUpperCase(), ...list])) : list;
  for (const currency of codes) {
    await db
      .insert(wallets)
      .values({ userId, currency, balance: "0.00", bonusBalance: "0.00" })
      .onConflictDoNothing();
  }
}

export async function listWallets(userId: number): Promise<WalletRow[]> {
  await ensureWallets(userId);
  const rows = await db.select().from(wallets).where(eq(wallets.userId, userId));
  return rows.map((r) => ({ currency: r.currency, balance: Number(r.balance), bonusBalance: Number(r.bonusBalance) }));
}

export async function getActiveCurrency(userId: number): Promise<string> {
  const [u] = await db.select({ currency: users.currency }).from(users).where(eq(users.id, userId)).limit(1);
  return (u?.currency ?? "KES").toUpperCase();
}

/** Keeps users.balance as a mirror of the active wallet so legacy reads stay correct. */
export async function refreshMirror(userId: number): Promise<number> {
  const currency = await getActiveCurrency(userId);
  const [row] = await db
    .select({ balance: wallets.balance, bonus: wallets.bonusBalance })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)))
    .limit(1);
  const balance = row?.balance ?? "0.00";
  const bonus = row?.bonus ?? "0.00";
  await db.update(users).set({ balance, bonusBalance: bonus }).where(eq(users.id, userId));
  return Number(balance);
}

export type DebitResult = { ok: boolean; balance: number; currency: string; error?: string };

export async function debitWallet(userId: number, amount: number, currency?: string): Promise<DebitResult> {
  const ccy = (currency ?? (await getActiveCurrency(userId))).toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, balance: 0, currency: ccy, error: "Invalid stake amount." };
  }
  const [row] = await db
    .update(wallets)
    .set({ balance: sql`${wallets.balance} - ${amount.toFixed(2)}`, updatedAt: new Date() })
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, ccy), sql`${wallets.balance} >= ${amount.toFixed(2)}`))
    .returning({ balance: wallets.balance });
  if (!row) {
    const [existing] = await db
      .select({ balance: wallets.balance })
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.currency, ccy)))
      .limit(1);
    return {
      ok: false,
      balance: Number(existing?.balance ?? 0),
      currency: ccy,
      error: `Insufficient ${ccy} balance.`,
    };
  }
  const balance = Number(row.balance);
  if (ccy === (await getActiveCurrency(userId))) await refreshMirror(userId);
  return { ok: true, balance, currency: ccy };
}

export async function creditWallet(
  userId: number,
  amount: number,
  currency?: string,
  kind: "balance" | "bonus" = "balance",
): Promise<{ balance: number; currency: string }> {
  const ccy = (currency ?? (await getActiveCurrency(userId))).toUpperCase();
  await ensureWallets(userId, ccy);
  const field = kind === "bonus" ? wallets.bonusBalance : wallets.balance;
  const [row] = await db
    .update(wallets)
    .set({ [kind === "bonus" ? "bonusBalance" : "balance"]: sql`${field} + ${amount.toFixed(2)}`, updatedAt: new Date() } as never)
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, ccy)))
    .returning({ balance: wallets.balance });
  if (ccy === (await getActiveCurrency(userId))) await refreshMirror(userId);
  return { balance: Number(row?.balance ?? 0), currency: ccy };
}

export async function setActiveCurrency(userId: number, currency: string): Promise<WalletRow[]> {
  const list = await enabledCurrencies();
  const ccy = currency.toUpperCase();
  if (!list.includes(ccy)) throw new Error("That currency account is not available.");
  await ensureWallets(userId, ccy);
  await db.update(users).set({ currency: ccy }).where(eq(users.id, userId));
  await refreshMirror(userId);
  return listWallets(userId);
}
