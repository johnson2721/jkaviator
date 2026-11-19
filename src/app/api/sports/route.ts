import { ensureFixturesEngine, listEvents, listLeagues } from "@/lib/server/fixtures";
import { SPORTS } from "@/lib/data/sports";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const engine = ensureFixturesEngine();
  await engine.ready;

  const sport = url.searchParams.get("sport") ?? undefined;
  const league = url.searchParams.get("league") ?? undefined;
  const day = url.searchParams.get("day") ?? undefined;
  const live = url.searchParams.get("live") === "1";
  const featured = url.searchParams.get("featured") === "1";
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 80));

  const [counts] = await db
    .select({
      live: sql<number>`count(*) filter (where ${events.status} = 'live')::int`,
      upcoming: sql<number>`count(*) filter (where ${events.status} = 'scheduled')::int`,
    })
    .from(events);

  const sportCounts = await db
    .select({ sport: events.sport, n: sql<number>`count(*)::int` })
    .from(events)
    .where(sql`${events.status} in ('scheduled','live')`)
    .groupBy(events.sport);

  const items = await listEvents({ sport, league, day, live, featured, limit });
  const leagues = await listLeagues(sport);

  return Response.json({
    sports: SPORTS.map((s) => ({ ...s, count: sportCounts.find((c) => c.sport === s.key)?.n ?? 0 })),
    counts: { live: Number(counts?.live ?? 0), upcoming: Number(counts?.upcoming ?? 0) },
    events: items,
    leagues,
  });
}
