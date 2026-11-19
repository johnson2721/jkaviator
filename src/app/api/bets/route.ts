import { db } from "@/db";
import { bets, rounds } from "@/db/schema";
import { ensureEngine } from "@/lib/game/engine";
import { requireUser, toPublicUser } from "@/lib/server/session";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const autoEnabled = Boolean(body.autoCashoutEnabled);
  const autoCashout = autoEnabled ? Number(body.autoCashout) : null;

  try {
    const engine = ensureEngine();
    const result = await engine.placeBet({ id: auth.user.id, name: auth.user.name }, amount, autoCashout);
    return Response.json({ ok: true, ...result, balance: result.balance });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to place this bet.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "history";

  if (scope === "active") {
    const engine = ensureEngine();
    const active = engine.snapshot().bets.filter((b) => !b.simulated && b.userId === auth.user.id);
    const pendingRows = await db
      .select()
      .from(bets)
      .where(and(eq(bets.userId, auth.user.id), eq(bets.status, "pending")))
      .orderBy(desc(bets.id))
      .limit(5);
    return Response.json({ active, pending: pendingRows.map((b) => ({ ...b, amount: Number(b.amount) })) });
  }

  const rows = await db
    .select({
      id: bets.id,
      roundId: bets.roundId,
      amount: bets.amount,
      status: bets.status,
      multiplier: bets.multiplier,
      payout: bets.payout,
      autoCashoutAt: bets.autoCashoutAt,
      placedAt: bets.placedAt,
      crashPoint: rounds.crashPoint,
    })
    .from(bets)
    .leftJoin(rounds, eq(rounds.id, bets.roundId))
    .where(eq(bets.userId, auth.user.id))
    .orderBy(desc(bets.id))
    .limit(60);

  return Response.json({
    user: toPublicUser(auth.user),
    bets: rows.map((r) => ({
      id: r.id,
      roundId: r.roundId,
      amount: Number(r.amount),
      status: r.status,
      multiplier: r.multiplier ? Number(r.multiplier) : null,
      payout: Number(r.payout),
      autoCashoutAt: r.autoCashoutAt ? Number(r.autoCashoutAt) : null,
      placedAt: r.placedAt,
      crashPoint: r.crashPoint ? Number(r.crashPoint) : null,
    })),
  });
}
