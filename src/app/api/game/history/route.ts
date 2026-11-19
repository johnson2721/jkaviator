import { db } from "@/db";
import { bets, rounds, users } from "@/db/schema";
import { ensureEngine } from "@/lib/game/engine";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const engine = ensureEngine();
  const lastRounds = await db
    .select({ id: rounds.id, crashPoint: rounds.crashPoint, startedAt: rounds.startedAt })
    .from(rounds)
    .orderBy(desc(rounds.id))
    .limit(40);

  const topWins = await db
    .select({
      id: bets.id,
      amount: bets.amount,
      multiplier: bets.multiplier,
      payout: bets.payout,
      name: users.name,
      createdAt: bets.settledAt,
    })
    .from(bets)
    .innerJoin(users, eq(users.id, bets.userId))
    .where(eq(bets.status, "won"))
    .orderBy(desc(bets.settledAt))
    .limit(12);

  return Response.json({
    history: engine.history,
    rounds: lastRounds.map((r) => ({
      id: r.id,
      crashPoint: Number(r.crashPoint),
      startedAt: r.startedAt,
    })),
    topWins: topWins.map((w) => ({
      name: `${w.name.charAt(0).toUpperCase()}***`,
      amount: Number(w.amount),
      multiplier: Number(w.multiplier ?? 0),
      payout: Number(w.payout),
      at: w.createdAt,
    })),
  });
}
