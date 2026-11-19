import { db } from "@/db";
import { bets, bonusRequests, rounds, transactions, users, wallets, sportBets, casinoBets } from "@/db/schema";
import { ensureEngine } from "@/lib/game/engine";
import { integrationSummary } from "@/lib/server/config";
import { requireAdmin } from "@/lib/server/session";
import { and, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const engine = ensureEngine();

  const [stats] = await db
    .select({
      totalUsers: sql<number>`count(*) filter (where ${users.role} = 'user')`,
      activeUsers: sql<number>`count(*) filter (where ${users.role} = 'user' and ${users.status} = 'active')`,
      liabilities: sql<string>`coalesce((select sum(${wallets.balance}) from ${wallets} join ${users} on ${users.id} = ${wallets.userId} where ${users.role} = 'user'), 0)`,
      bonusLiability: sql<string>`coalesce(sum(${users.bonusBalance}) filter (where ${users.role} = 'user'), 0)`,
      totalStaked: sql<string>`coalesce(sum(${users.totalStaked}), 0)`,
      totalWon: sql<string>`coalesce(sum(${users.totalWon}), 0)`,
    })
    .from(users);

  const [betStats] = await db
    .select({
      bets: sql<number>`count(*)`,
      staked: sql<string>`coalesce(sum(${bets.amount}), 0)`,
      paid: sql<string>`coalesce(sum(${bets.payout}) , 0)`,
      pending: sql<number>`count(*) filter (where ${bets.status} = 'pending')`,
    })
    .from(bets);

  const [roundStats] = await db
    .select({
      rounds: sql<number>`count(*)`,
      avgCrash: sql<string>`coalesce(avg(${rounds.crashPoint}), 0)`,
      maxCrash: sql<string>`coalesce(max(${rounds.crashPoint}), 0)`,
    })
    .from(rounds);

  const [depositStats] = await db
    .select({
      deposits: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'deposit' and ${transactions.status} = 'completed'), 0)`,
      withdrawals: sql<string>`coalesce(sum(-${transactions.amount}) filter (where ${transactions.type} = 'withdrawal' and ${transactions.status} = 'completed'), 0)`,
    })
    .from(transactions);

  const pendingBonuses = await db
    .select({
      id: bonusRequests.id,
      type: bonusRequests.type,
      code: bonusRequests.code,
      amount: bonusRequests.amount,
      message: bonusRequests.message,
      createdAt: bonusRequests.createdAt,
      userId: users.id,
      userName: users.name,
      userPhone: users.phone,
      userBalance: users.balance,
    })
    .from(bonusRequests)
    .innerJoin(users, eq(users.id, bonusRequests.userId))
    .where(eq(bonusRequests.status, "pending"))
    .orderBy(bonusRequests.id)
    .limit(50);

  const pendingWithdrawals = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      method: transactions.method,
      reference: transactions.reference,
      note: transactions.note,
      details: transactions.details,
      notifiedAt: transactions.notifiedAt,
      createdAt: transactions.createdAt,
      userId: users.id,
      userName: users.name,
      userPhone: users.phone,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .where(and(eq(transactions.type, "withdrawal"), eq(transactions.status, "pending")))
    .orderBy(transactions.id)
    .limit(50);

  const recentBets = await db
    .select({
      id: bets.id,
      amount: bets.amount,
      status: bets.status,
      multiplier: bets.multiplier,
      payout: bets.payout,
      roundId: bets.roundId,
      placedAt: bets.placedAt,
      userName: users.name,
      userPhone: users.phone,
    })
    .from(bets)
    .innerJoin(users, eq(users.id, bets.userId))
    .where(eq(users.role, "user"))
    .orderBy(desc(bets.id))
    .limit(25);

  const recentUsers = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      email: users.email,
      balance: users.balance,
      status: users.status,
      totalStaked: users.totalStaked,
      betsCount: users.betsCount,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, "user"))
    .orderBy(desc(users.id))
    .limit(25);

  const [sports] = await db
    .select({
      bets: sql<number>`count(*)::int`,
      staked: sql<string>`coalesce(sum(${sportBets.stake}), 0)`,
      paid: sql<string>`coalesce(sum(${sportBets.payout}), 0)`,
      open: sql<number>`count(*) filter (where ${sportBets.status} = 'pending')::int`,
    })
    .from(sportBets);

  const [casino] = await db
    .select({
      bets: sql<number>`count(*)::int`,
      staked: sql<string>`coalesce(sum(${casinoBets.stake}), 0)`,
      paid: sql<string>`coalesce(sum(${casinoBets.payout}), 0)`,
    })
    .from(casinoBets);

  const [walletTotals] = await db
    .select({
      accounts: sql<number>`count(*)::int`,
      held: sql<string>`coalesce(sum(${wallets.balance}), 0)`,
    })
    .from(wallets);

  return Response.json({
    integrations: integrationSummary(),
    sportsbook: {
      bets: Number(sports?.bets ?? 0),
      open: Number(sports?.open ?? 0),
      staked: Number(sports?.staked ?? 0),
      paid: Number(sports?.paid ?? 0),
    },
    casino: {
      bets: Number(casino?.bets ?? 0),
      staked: Number(casino?.staked ?? 0),
      paid: Number(casino?.paid ?? 0),
    },
    walletAccounts: Number(walletTotals?.accounts ?? 0),
    walletHeld: Number(walletTotals?.held ?? 0),
    live: { roundId: engine.roundId, phase: engine.phase, multiplier: engine.multiplier, online: engine.snapshot().online },
    stats: {
      totalUsers: Number(stats?.totalUsers ?? 0),
      activeUsers: Number(stats?.activeUsers ?? 0),
      liabilities: Number(stats?.liabilities ?? 0),
      bonusLiability: Number(stats?.bonusLiability ?? 0),
      totalStaked: Number(stats?.totalStaked ?? 0),
      totalWon: Number(stats?.totalWon ?? 0),
      bets: Number(betStats?.bets ?? 0),
      pendingBets: Number(betStats?.pending ?? 0),
      staked: Number(betStats?.staked ?? 0),
      paid: Number(betStats?.paid ?? 0),
      rounds: Number(roundStats?.rounds ?? 0),
      avgCrash: Number(Number(roundStats?.avgCrash ?? 0).toFixed(2)),
      maxCrash: Number(roundStats?.maxCrash ?? 0),
      deposits: Number(depositStats?.deposits ?? 0),
      withdrawals: Number(depositStats?.withdrawals ?? 0),
    },
    pendingBonuses: pendingBonuses.map((b) => ({ ...b, amount: Number(b.amount), userBalance: Number(b.userBalance) })),
    pendingWithdrawals: pendingWithdrawals.map((w) => ({
      ...w,
      amount: Math.abs(Number(w.amount)),
      details: (() => {
        try {
          return w.details ? (JSON.parse(w.details) as Record<string, string>) : null;
        } catch {
          return null;
        }
      })(),
    })),
    recentBets: recentBets.map((b) => ({
      ...b,
      amount: Number(b.amount),
      payout: Number(b.payout),
      multiplier: b.multiplier ? Number(b.multiplier) : null,
    })),
    recentUsers,
  });
}
