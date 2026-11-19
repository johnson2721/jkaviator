import { db } from "@/db";
import { sportBets, users } from "@/db/schema";
import { ensureFixturesEngine, placeSportBet, type SlipInput } from "@/lib/server/fixtures";
import { requireUser, toPublicUser } from "@/lib/server/session";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const stake = Number(body.stake);
  const slip = (Array.isArray(body.slip) ? body.slip : []) as SlipInput;
  ensureFixturesEngine();

  try {
    const result = await placeSportBet(auth.user.id, slip, stake);
    const [fresh] = await db.select().from(users).where(eq(users.id, auth.user.id));
    return Response.json({ ok: true, ...result, user: fresh ? toPublicUser(fresh) : undefined });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Bet rejected." }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const scope = new URL(req.url).searchParams.get("scope") ?? "open";
  const rows = await db
    .select()
    .from(sportBets)
    .where(scope === "open" ? eq(sportBets.status, "pending") : eq(sportBets.userId, auth.user.id))
    .orderBy(desc(sportBets.id))
    .limit(60);
  return Response.json({
    bets: rows.map((b) => ({
      id: b.id,
      currency: b.currency,
      kind: b.kind,
      stake: Number(b.stake),
      totalOdds: Number(b.totalOdds),
      potentialPayout: Number(b.potentialPayout),
      payout: Number(b.payout),
      status: b.status,
      selections: b.selections,
      placedAt: b.placedAt,
      settledAt: b.settledAt,
    })),
  });
}
