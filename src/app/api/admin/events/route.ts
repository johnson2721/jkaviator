import { db } from "@/db";
import { events, sportBets } from "@/db/schema";
import { buildMarketsFor, ensureFixturesEngine, legOfEvent, publicEvent, type Market } from "@/lib/server/fixtures";
import { creditWallet } from "@/lib/server/wallet";
import { requireAdmin } from "@/lib/server/session";
import { and, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Operator control over the sportsbook: create, edit prices, force-settle or void a match. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const eventId = Number(body.eventId);
  ensureFixturesEngine();

  if (action === "create") {
    const sport = String(body.sport ?? "football");
    const league = String(body.league ?? "Custom League");
    const home = String(body.home ?? "").trim();
    const away = String(body.away ?? "").trim();
    if (home.length < 2 || away.length < 2) {
      return Response.json({ error: "Both team names are required." }, { status: 400 });
    }
    const kickoffRaw = String(body.kickoff ?? "");
    const kickoff = kickoffRaw ? new Date(kickoffRaw) : new Date(Date.now() + 3600_000);
    const margin = Number(body.margin ?? 5);
    const markets = buildMarketsFor(sport, home, away, Number.isFinite(margin) ? margin : 5);
    const [row] = await db
      .insert(events)
      .values({
        sport,
        league,
        country: String(body.country ?? "International"),
        home,
        away,
        kickoff: Number.isNaN(kickoff.getTime()) ? new Date(Date.now() + 3600_000) : kickoff,
        status: "scheduled",
        markets,
        featured: Boolean(body.featured),
      })
      .returning();
    return Response.json({ ok: true, event: publicEvent(row) });
  }

  if (!Number.isFinite(eventId)) return Response.json({ error: "eventId is required." }, { status: 400 });
  const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) return Response.json({ error: "Match not found." }, { status: 404 });

  if (action === "prices") {
    const markets = body.markets as Market[];
    if (!Array.isArray(markets)) return Response.json({ error: "markets array is required." }, { status: 400 });
    const [row] = await db.update(events).set({ markets }).where(eq(events.id, eventId)).returning();
    return Response.json({ ok: true, event: publicEvent(row) });
  }

  if (action === "score") {
    const [row] = await db
      .update(events)
      .set({
        homeScore: Math.max(0, Number(body.homeScore ?? ev.homeScore)),
        awayScore: Math.max(0, Number(body.awayScore ?? ev.awayScore)),
        minute: Math.max(0, Number(body.minute ?? ev.minute)),
        status: String(body.status ?? ev.status),
      })
      .where(eq(events.id, eventId))
      .returning();
    return Response.json({ ok: true, event: publicEvent(row) });
  }

  if (action === "settle" || action === "void") {
    const homeScore = Math.max(0, Number(body.homeScore ?? ev.homeScore));
    const awayScore = Math.max(0, Number(body.awayScore ?? ev.awayScore));
    const cancelled = action === "void";
    const [row] = await db
      .update(events)
      .set({
        status: cancelled ? "cancelled" : "finished",
        homeScore,
        awayScore,
        htHome: ev.htHome ?? homeScore,
        htAway: ev.htAway ?? awayScore,
        settledAt: new Date(),
      })
      .where(eq(events.id, eventId))
      .returning();

    const pending = await db
      .select()
      .from(sportBets)
      .where(and(eq(sportBets.status, "pending"), legOfEvent(eventId)))
      .limit(500);

    let refunded = 0;
    let settled = 0;
    for (const bet of pending) {
      if (cancelled) {
        // Void: refund the stake (single) or drop the leg (accumulator).
        const legs = (bet.selections as { eventId: number; status?: string }[]) ?? [];
        const onlyLeg = legs.length === 1;
        if (onlyLeg) {
          await creditWallet(bet.userId, Number(bet.stake), bet.currency);
          await db.update(sportBets).set({ status: "void", payout: bet.stake, settledAt: new Date() }).where(eq(sportBets.id, bet.id));
          refunded += 1;
          continue;
        }
        const next = legs.map((l) => (l.eventId === eventId ? { ...l, status: "void" } : l));
        await db.update(sportBets).set({ selections: next }).where(eq(sportBets.id, bet.id));
        continue;
      }
      settled += 1;
    }

    if (!cancelled) {
      const engine = ensureFixturesEngine();
      await engine.settleEvent(eventId, {
        homeScore,
        awayScore,
        htHome: row.htHome,
        htAway: row.htAway,
        sport: row.sport,
      });
    }

    return Response.json({ ok: true, refunded, settled, event: publicEvent(row) });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
