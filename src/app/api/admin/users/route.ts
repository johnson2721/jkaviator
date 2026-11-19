import { db } from "@/db";
import { bets, transactions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/session";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { creditWallet, debitWallet, getActiveCurrency, listWallets } from "@/lib/server/wallet";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  const filter = q
    ? or(ilike(users.name, `%${q}%`), ilike(users.phone, `%${q}%`), ilike(users.email, `%${q}%`))
    : eq(users.role, "user");

  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "user"), filter))
    .orderBy(desc(users.id))
    .limit(100);

  return Response.json({
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      balance: Number(u.balance),
      bonusBalance: Number(u.bonusBalance),
      status: u.status,
      totalStaked: Number(u.totalStaked),
      totalWon: Number(u.totalWon),
      betsCount: u.betsCount,
      currency: u.currency,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const userId = Number(body.userId);
  const action = String(body.action ?? "");
  const note = String(body.note ?? "").trim().slice(0, 300) || null;

  const [target] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.role, "user"))).limit(1);
  if (!target) return Response.json({ error: "Player not found." }, { status: 404 });

  if (action === "block" || action === "unblock") {
    const status = action === "block" ? "blocked" : "active";
    // Cancel any live bet they have in the current round.
    if (action === "block") {
      await db.update(bets).set({ status: "lost", settledAt: new Date() }).where(and(eq(bets.userId, userId), eq(bets.status, "pending")));
    }
    const [updated] = await db.update(users).set({ status }).where(eq(users.id, userId)).returning();
    return Response.json({ ok: true, user: { id: updated.id, status: updated.status, balance: Number(updated.balance) } });
  }

  if (action === "adjust") {
    const amount = Math.floor(Number(body.amount) * 100) / 100;
    const currency = String(body.currency ?? (await getActiveCurrency(userId))).toUpperCase();
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) {
      return Response.json({ error: "Enter a valid adjustment amount." }, { status: 400 });
    }
    const balance =
      amount > 0
        ? (await creditWallet(userId, amount, currency)).balance
        : (await debitWallet(userId, Math.abs(amount), currency)).balance;
    await db.insert(transactions).values({
      userId,
      type: amount > 0 ? "bonus" : "adjustment",
      amount: amount.toFixed(2),
      currency,
      balanceAfter: balance.toFixed(2),
      status: "completed",
      method: "OPERATOR",
      reference: `ADJ-${userId}-${Date.now().toString(36).toUpperCase()}`,
      note: note ?? `Manual ${currency} adjustment by operator`,
      reviewedBy: auth.user.id,
      reviewedAt: new Date(),
    });
    const walletRows = await listWallets(userId);
    return Response.json({ ok: true, user: { id: userId, balance, currency, wallets: walletRows } });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
