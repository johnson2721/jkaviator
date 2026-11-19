import "server-only";
import crypto from "node:crypto";
import { db } from "@/db";
import { events, sportBets, transactions, users } from "@/db/schema";
import { getSettings } from "./settings";
import { debitWallet, creditWallet, getActiveCurrency } from "./wallet";
import { LEAGUES, SPORT_MAP } from "@/lib/data/sports";
import { buildMarkets as buildMarketsImpl, settleLeg, type Leg, type Market, type Selection } from "./markets";

import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";

export type { Leg, Market, Selection };

const rnd = (n: number) => crypto.randomInt(0, n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function teamStrength(name: string): number {
  const h = crypto.createHash("sha1").update(name).digest();
  return (h.readUInt32BE(0) % 1000) / 1000;
}

/* ------------------------------------------------------------------ fixtures */

export async function ensureFixtures(): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(events);
  const open = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events)
    .where(or(eq(events.status, "scheduled"), eq(events.status, "live")));
  if (Number(open[0]?.n ?? 0) > 40) return Number(n ?? 0);

  const settings = await getSettings();
  const now = Date.now();
  const rows: (typeof events.$inferInsert)[] = [];

  for (const league of LEAGUES) {
    const teams = [...league.teams];
    const pairCount = Math.min(6, Math.floor(teams.length / 2));
    for (let i = 0; i < pairCount; i += 1) {
      const home = teams.splice(rnd(teams.length), 1)[0];
      const away = teams.splice(rnd(teams.length), 1)[0];
      // 20% kick off in the recent past (already live), the rest spread over 7 days
      const liveSoon = rnd(100) < 20;
      const offsetMs = liveSoon ? -rnd(35) * 60_000 : rnd(7 * 24 * 60) * 60_000 + 20 * 60_000;
      rows.push({
        sport: league.sport,
        league: league.name,
        country: league.country,
        home,
        away,
        kickoff: new Date(now + offsetMs),
        status: "scheduled",
        markets: buildMarketsImpl(league.sport, home, away, settings.oddsMarginPct),
        featured: rnd(100) < 12,
      });
    }
  }

  if (rows.length) await db.insert(events).values(rows);
  // Purge stale finished events so the table stays lean.
  await db.delete(events).where(and(eq(events.status, "finished"), lt(events.settledAt, new Date(now - 3 * 24 * 3600_000))));
  return rows.length;
}

/* ------------------------------------------------------------- live engine */

class FixtureEngine {
  timer: ReturnType<typeof setInterval> | null = null;
  busy = false;
  started = false;
  ready: Promise<void> = Promise.resolve();

  start() {
    if (this.started) return this.ready;
    this.started = true;
    this.ready = (async () => {
      try {
        await ensureFixtures();
        await this.recover();
      } catch (err) {
        console.error("[fixtures] bootstrap failed", err);
      }
      this.timer = setInterval(() => void this.tick(), 4000);
    })();
    return this.ready;
  }

  /** Kick off anything whose start time passed while the process was down. */
  private async recover() {
    const overdue = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.status, "scheduled"), lt(events.kickoff, new Date())))
      .limit(200);
    for (const row of overdue) await this.advance(row.id, true);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const due = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.status, "scheduled"), lte(events.kickoff, new Date())))
        .orderBy(asc(events.kickoff))
        .limit(6);
      for (const row of due) await this.advance(row.id, false);

      const live = await db.select({ id: events.id }).from(events).where(eq(events.status, "live")).limit(30);
      for (const row of live) await this.advance(row.id, false);

      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(events).where(eq(events.status, "live"));
      if (Number(n ?? 0) < 5) {
        await db.execute(
          sql`update ${events} set kickoff = now() where id in (select id from ${events} where status = 'scheduled' order by kickoff asc limit 6)`,
        );
        await ensureFixtures();
      }
    } catch (err) {
      console.error("[fixtures] tick error", err);
    } finally {
      this.busy = false;
    }
  }

  async advance(eventId: number, instant: boolean): Promise<void> {
    const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!ev) return;
    const sport = SPORT_MAP[ev.sport];
    const totalMinutes = ev.sport === "football" || ev.sport === "hockey" ? 90 : ev.sport === "basketball" ? 48 : 60;

    if (ev.status === "scheduled") {
      const { sh, sa } = this.expectedGoals(ev.sport, ev.home, ev.away);
      (globalThis as Record<string, unknown>)[`kb-lambda-${ev.id}`] = JSON.stringify({ sh, sa });
      await db.update(events).set({ status: "live", minute: 0 }).where(eq(events.id, eventId));
      ev.status = "live";
      ev.minute = 0;
      if (instant) await this.advance(eventId, false);
      return;
    }

    if (ev.status !== "live") return;
    const raw = (globalThis as Record<string, unknown>)[`kb-lambda-${ev.id}`];
    const lambdas = raw ? (JSON.parse(String(raw)) as { sh: number; sa: number }) : this.expectedGoals(ev.sport, ev.home, ev.away);
    const step = 2 + rnd(4);
    const from = ev.minute;
    const to = Math.min(totalMinutes, from + step);
    let hs = ev.homeScore;
    let as = ev.awayScore;
    let htHome = ev.htHome;
    let htAway = ev.htAway;

    const perMinute = ev.sport === "football" || ev.sport === "hockey" ? 1 : ev.sport === "basketball" ? 2.4 : 1.6;
    for (let m = from; m < to; m += 1) {
      if (Math.random() < (lambdas.sh / totalMinutes) * perMinute) hs += ev.sport === "basketball" ? 2 + rnd(2) : 1;
      if (Math.random() < (lambdas.sa / totalMinutes) * perMinute) as += ev.sport === "basketball" ? 2 + rnd(2) : 1;
      if (htHome === null && m + 1 >= totalMinutes / 2) {
        htHome = hs;
        htAway = as;
      }
    }

    if (to >= totalMinutes) {
      await db
        .update(events)
        .set({ status: "finished", minute: totalMinutes, homeScore: hs, awayScore: as, htHome, htAway, settledAt: new Date() })
        .where(eq(events.id, eventId));
      delete (globalThis as Record<string, unknown>)[`kb-lambda-${ev.id}`];
      await this.settleEvent(eventId, { homeScore: hs, awayScore: as, htHome, htAway, sport: ev.sport });
      return;
    }
    await db.update(events).set({ minute: to, homeScore: hs, awayScore: as, htHome, htAway }).where(eq(events.id, eventId));
  }

  private expectedGoals(sport: string, home: string, away: string): { sh: number; sa: number } {
    const sh0 = teamStrength(home);
    const sa0 = teamStrength(away);
    const diff = sh0 - sa0;
    if (sport === "basketball") return { sh: 108 + diff * 22, sa: 104 - diff * 20 };
    if (sport === "tennis") return { sh: 13 + diff * 4, sa: 12 - diff * 4 };
    if (sport === "cricket") return { sh: 165 + diff * 40, sa: 158 - diff * 38 };
    if (sport === "esports") return { sh: 14 + diff * 5, sa: 12 - diff * 5 };
    if (sport === "volleyball") return { sh: 92 + diff * 14, sa: 88 - diff * 13 };
    if (sport === "baseball") return { sh: 4.6 + diff * 2.2, sa: 4.2 - diff * 2 };
    if (sport === "rugby") return { sh: 24 + diff * 12, sa: 21 - diff * 11 };
    if (sport === "boxing") return { sh: 10 + diff * 3, sa: 9 - diff * 3 };
    if (sport === "hockey") return { sh: 3 + diff * 1.6, sa: 2.7 - diff * 1.5 };
    return { sh: 1.4 + diff * 1.4, sa: 1.15 - diff * 1.2 };
  }

  /* ------------------------------------------------------- bet settlement */

  settleSelection(
    leg: Leg,
    ev: { homeScore: number; awayScore: number; htHome: number | null; htAway: number | null; sport: string },
  ): "won" | "lost" | "void" {
    return settleLeg(leg, ev);
  }

  async settleEvent(eventId: number, ev: { homeScore: number; awayScore: number; htHome: number | null; htAway: number | null; sport: string }) {
    const affected = await db
      .select()
      .from(sportBets)
      .where(and(eq(sportBets.status, "pending"), legOfEvent(eventId)))
      .limit(500);

    for (const bet of affected) {
      const legs = (bet.selections as Leg[]) ?? [];
      let changed = false;
      let odds = 1;
      let allDecided = true;
      let anyLost = false;
      for (const leg of legs) {
        if (leg.eventId === eventId && (!leg.status || leg.status === "pending")) {
          leg.status = this.settleSelection(leg, ev);
          changed = true;
        }
        if (!leg.status || leg.status === "pending") allDecided = false;
        if (leg.status === "lost") anyLost = true;
        if (leg.status === "won") odds *= leg.price;
      }
      if (!changed) continue;

      if (!allDecided) {
        await db.update(sportBets).set({ selections: legs, totalOdds: r3(odds).toFixed(3) }).where(eq(sportBets.id, bet.id));
        continue;
      }

      const stake = Number(bet.stake);
      if (anyLost) {
        await db.update(sportBets).set({ status: "lost", selections: legs, payout: "0.00", settledAt: new Date() }).where(eq(sportBets.id, bet.id));
        continue;
      }
      const payout = r2(stake * odds);
      await db
        .update(sportBets)
        .set({ status: "won", selections: legs, totalOdds: r3(odds).toFixed(3), payout: payout.toFixed(2), settledAt: new Date() })
        .where(and(eq(sportBets.id, bet.id), eq(sportBets.status, "pending")));
      await creditWallet(bet.userId, payout, bet.currency);
      await this.logTx(bet.userId, bet.currency, payout, "Sportsbook win", `SBET-${bet.id}`);
    }
  }

  private async logTx(userId: number, currency: string, amount: number, note: string, reference: string) {
    const [u] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId)).limit(1);
    await db.insert(transactions).values({
      userId,
      type: amount >= 0 ? "cashout" : "bet",
      amount: amount.toFixed(2),
      balanceAfter: u?.balance ?? "0.00",
      status: "completed",
      method: currency,
      reference,
      note,
    });
  }
}

function lte(column: Parameters<typeof eq>[0], value: Date) {
  return sql`${column} <= ${value}`;
}

const globalForFixtures = globalThis as typeof globalThis & { __kbFixtures?: FixtureEngine };
export const fixtures: FixtureEngine = globalForFixtures.__kbFixtures ?? new FixtureEngine();
globalForFixtures.__kbFixtures = fixtures;

export function ensureFixturesEngine() {
  void fixtures.start();
  return fixtures;
}

/* ------------------------------------------------------------- bet placing */

export type SlipInput = { eventId: number; marketKey: string; selKey: string; line?: number }[];

/** True for any bet slip that contains a leg on this event (jsonb-safe). */
export function legOfEvent(eventId: number) {
  return sql`exists (select 1 from jsonb_array_elements(${sportBets.selections}) as leg where (leg->>'eventId')::int = ${eventId})`;
}

export async function placeSportBet(userId: number, slip: SlipInput, stake: number) {
  const settings = await getSettings();
  if (!slip?.length) throw new Error("Your bet slip is empty.");
  if (slip.length > settings.maxAccumLegs) throw new Error(`Maximum ${settings.maxAccumLegs} selections per slip.`);
  if (!Number.isFinite(stake) || stake <= 0) throw new Error("Enter a valid stake.");

  const currency = await getActiveCurrency(userId);
  const ids = Array.from(new Set(slip.map((s) => s.eventId)));
  const rows = await db.select().from(events).where(inArray(events.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const legs: Leg[] = [];
  let totalOdds = 1;
  for (const item of slip) {
    const ev = byId.get(item.eventId);
    if (!ev) throw new Error("One of the selected matches is no longer available.");
    if (ev.status === "finished" || ev.status === "cancelled") throw new Error(`${ev.home} vs ${ev.away} has already ended.`);
    const markets = (ev.markets as Market[]) ?? [];
    const market = markets.find(
      (m) => m.key === item.marketKey && (item.line === undefined || item.line === null || m.line === item.line),
    );
    if (!market) throw new Error("That market is no longer offered.");
    const sel = market.selections.find((s) => s.key === item.selKey);
    if (!sel) throw new Error("That selection is no longer offered.");
    if (legs.some((l) => l.eventId === ev.id)) throw new Error("Only one selection per match is allowed in an accumulator.");
    legs.push({
      eventId: ev.id,
      sport: ev.sport,
      league: ev.league,
      home: ev.home,
      away: ev.away,
      marketKey: market.key,
      marketName: market.name,
      selKey: sel.key,
      selName: sel.name,
      line: market.line,
      price: sel.price,
      status: "pending",
    });
    totalOdds *= sel.price;
  }
  const debit = await debitWallet(userId, stake, currency);
  if (!debit.ok) throw new Error(debit.error ?? "Insufficient balance.");

  const payout = r2(stake * totalOdds);
  const [row] = await db
    .insert(sportBets)
    .values({
      userId,
      eventId: legs.length === 1 ? legs[0].eventId : null,
      currency,
      kind: legs.length === 1 ? "single" : "accum",
      stake: stake.toFixed(2),
      totalOdds: r3(totalOdds).toFixed(3),
      potentialPayout: payout.toFixed(2),
      selections: legs,
      status: "pending",
    })
    .returning({ id: sportBets.id });

  await db.insert(transactions).values({
    userId,
    type: "bet",
    amount: (-stake).toFixed(2),
    balanceAfter: debit.balance.toFixed(2),
    status: "completed",
    method: currency,
    reference: `SBET-${row.id}`,
    note: `${legs.length === 1 ? "Single" : `${legs.length}-fold accumulator`} · odds ${r3(totalOdds)}`,
  });
  await db.update(users).set({ betsCount: sql`${users.betsCount} + 1`, totalStaked: sql`${users.totalStaked} + ${stake.toFixed(2)}` }).where(eq(users.id, userId));

  return { betId: row.id, totalOdds: r3(totalOdds), potentialPayout: payout, currency, balance: debit.balance };
}

export async function listEvents(opts: {
  sport?: string;
  live?: boolean;
  league?: string;
  day?: string;
  featured?: boolean;
  limit?: number;
}) {
  const conds = [];
  if (opts.sport) conds.push(eq(events.sport, opts.sport));
  if (opts.league) conds.push(eq(events.league, opts.league));
  if (opts.live) conds.push(eq(events.status, "live"));
  else conds.push(inArray(events.status, ["scheduled", "live"]));
  if (opts.featured) conds.push(eq(events.featured, true));
  if (opts.day) {
    const start = new Date(opts.day);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start.getTime() + 24 * 3600_000);
      conds.push(gte(events.kickoff, start));
      conds.push(lt(events.kickoff, end));
    }
  }
  const rows = await db
    .select()
    .from(events)
    .where(conds.length ? and(...conds) : sql`true`)
    .orderBy(opts.live ? asc(events.minute) : asc(events.kickoff))
    .limit(opts.limit ?? 80);
  return rows.map(publicEvent);
}

export function publicEvent(e: typeof events.$inferSelect) {
  const markets = (e.markets as Market[]) ?? [];
  const main = markets[0];
  return {
    id: e.id,
    sport: e.sport,
    league: e.league,
    country: e.country,
    home: e.home,
    away: e.away,
    kickoff: e.kickoff,
    status: e.status,
    minute: e.minute,
    homeScore: e.homeScore,
    awayScore: e.awayScore,
    htHome: e.htHome,
    htAway: e.htAway,
    featured: e.featured,
    markets,
    main: main
      ? {
          key: main.key,
          short: main.short,
          selections: main.selections.map((s) => ({ key: s.key, name: s.name, price: s.price, line: main.line })),
        }
      : null,
    marketCount: markets.length,
  };
}

export async function getEvent(id: number) {
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return row ? publicEvent(row) : null;
}

export async function listLeagues(sport?: string) {
  const rows = await db
    .selectDistinct({ sport: events.sport, league: events.league, country: events.country })
    .from(events)
    .where(sport ? eq(events.sport, sport) : sql`true`);
  return rows;
}

/** Operator-facing market builder (used when creating a match by hand). */
export function buildMarketsFor(sport: string, home: string, away: string, marginPct: number): Market[] {
  return buildMarketsImpl(sport, home, away, marginPct);
}

export { r2, r3 };
