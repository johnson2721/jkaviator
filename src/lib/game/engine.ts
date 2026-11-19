import "server-only";
import crypto from "node:crypto";
import { db } from "@/db";
import { bets, rounds, transactions, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { GAME, displayMultiplier, money } from "./config";
import { maskName } from "@/lib/server/crypto";
import { creditWallet, debitWallet, getActiveCurrency } from "@/lib/server/wallet";

export type EnginePhase = "waiting" | "flying" | "crashed";

export type EngineBet = {
  id: number;
  userId: number;
  currency: string;
  name: string;
  amount: number;
  autoCashoutAt: number | null;
  simulated: boolean;
  status: "pending" | "won" | "lost";
  cashoutAt: number | null;
  payout: number | null;
  placedAt: number;
};

export type Snapshot = {
  roundId: number;
  phase: EnginePhase;
  multiplier: number;
  crashPoint: number | null;
  bettingEndsAt: number;
  flyingStartedAt: number;
  crashShownAt: number;
  serverNow: number;
  history: number[];
  bets: EngineBet[];
  online: number;
  totalStaked: number;
};

type Bot = EngineBet & { joinAt: number; target: number };
type Client = { push: (payload: string) => void };

const BOT_CURRENCIES = ["KES", "KES", "KES", "UGX", "TZS", "NGN", "USD", "ZAR", "GHS", "USDT"];

const FIRST_NAMES = [
  "Brian", "Amina", "Kevin", "Wanjiru", "Otieno", "Zawadi", "Kamau", "Fatuma", "Dennis", "Njeri",
  "Collins", "Achieng", "Victor", "Mumbi", "Samuel", "Halima", "Erick", "Nyambura", "Trevor", "Asha",
  "Kiplagat", "Mercy", "John", "Grace", "Peter", "Esther", "Ali", "Lucy", "Steve", "Faith",
];

function randomCrashPoint(): number {
  const r = crypto.randomInt(0, 1_000_000) / 1_000_000;
  if (r < GAME.HOUSE_EDGE) return 1.0;
  const raw = (1 - GAME.HOUSE_EDGE) / (1 - r);
  return Math.max(1.0, Math.min(GAME.MAX_MULTIPLIER, Math.floor(raw * 100) / 100));
}

class AviatorEngine {
  roundId = 1;
  phase: EnginePhase = "waiting";
  multiplier = 1;
  crashPoint: number | null = null;
  bettingEndsAt = Date.now() + GAME.BETTING_MS;
  flyingStartedAt = 0;
  crashShownAt = 0;
  history: number[] = [];
  liveBets: EngineBet[] = [];
  bots: Bot[] = [];
  clients = new Set<Client>();
  timer: ReturnType<typeof setInterval> | null = null;
  busy = false;
  started = false;
  simulatedBetId = -1;
  online = 0;

  snapshot(): Snapshot {
    return {
      roundId: this.roundId,
      phase: this.phase,
      multiplier: this.multiplier,
      crashPoint: this.phase === "crashed" ? this.crashPoint : null,
      bettingEndsAt: this.bettingEndsAt,
      flyingStartedAt: this.flyingStartedAt,
      crashShownAt: this.crashShownAt,
      serverNow: Date.now(),
      history: this.history,
      bets: this.liveBets.map((b) => ({ ...b })),
      online: Math.max(this.online, 40 + (this.roundId % 137)),
      totalStaked: money(this.liveBets.reduce((s, b) => s + b.amount, 0)),
    };
  }

  broadcast(type: string, extra: Record<string, unknown> = {}) {
    if (this.clients.size === 0) return;
    const payload = JSON.stringify({ type, snapshot: this.snapshot(), ...extra });
    for (const c of this.clients) {
      try {
        c.push(payload);
      } catch {
        this.clients.delete(c);
      }
    }
  }

  addClient(client: Client) {
    this.clients.add(client);
    this.online = this.clients.size;
  }

  removeClient(client: Client) {
    this.clients.delete(client);
    this.online = this.clients.size;
  }

  readyPromise: Promise<void> = Promise.resolve();

  async start() {
    if (this.started) return this.readyPromise;
    this.started = true;
    this.readyPromise = this.bootstrap();
    return this.readyPromise;
  }

  private async bootstrap() {
    try {
      const [maxRound] = await db
        .select({ r: sql<number>`coalesce(max(${rounds.id}), 0)` })
        .from(rounds);
      const [maxBetRound] = await db
        .select({ r: sql<number>`coalesce(max(${bets.roundId}), 0)` })
        .from(bets);
      this.roundId = Math.max(Number(maxRound?.r ?? 0), Number(maxBetRound?.r ?? 0)) + 1;

      const rows = await db
        .select({ crash: rounds.crashPoint })
        .from(rounds)
        .orderBy(sql`${rounds.id} desc`)
        .limit(24);
      this.history = rows.map((r) => Number(r.crash));

      // Recover any bets orphaned by a previous process restart.
      await db
        .update(bets)
        .set({ status: "lost", payout: "0.00", settledAt: new Date() })
        .where(eq(bets.status, "pending"));
    } catch (err) {
      console.error("[engine] bootstrap failed", err);
    }
    this.phase = "waiting";
    this.bettingEndsAt = Date.now() + GAME.BETTING_MS;
    this.spawnBots();
    this.timer = setInterval(() => {
      void this.tick();
    }, GAME.TICK_MS);
  }

  private spawnBots() {
    this.bots = [];
    const count = 7 + crypto.randomInt(0, 9);
    for (let i = 0; i < count; i += 1) {
      const amount = [10, 20, 50, 100, 100, 200, 250, 500, 1000, 2000, 5000][crypto.randomInt(0, 11)];
      const target = [1.2, 1.35, 1.5, 1.7, 2, 2.2, 2.5, 3, 4, 5, 8, 12, 25][crypto.randomInt(0, 13)];
      const useAuto = crypto.randomInt(0, 10) < 6;
      this.bots.push({
        id: this.simulatedBetId--,
        userId: 0,
        currency: BOT_CURRENCIES[crypto.randomInt(0, BOT_CURRENCIES.length)],
        name: maskName(FIRST_NAMES[crypto.randomInt(0, FIRST_NAMES.length)]),
        amount,
        autoCashoutAt: useAuto ? target : null,
        simulated: true,
        status: "pending",
        cashoutAt: null,
        payout: null,
        placedAt: Date.now(),
        joinAt: Date.now() + (i < 3 ? 0 : crypto.randomInt(300, GAME.BETTING_MS + 1500)),
        target,
      });
    }
  }

  private async tick() {
    // Single-flight guard: never run two ticks (or two settlements) at once.
    if (this.busy) return;
    this.busy = true;
    const now = Date.now();
    try {
      if (this.phase === "waiting") {
        for (const bot of this.bots) {
          if (bot.joinAt <= now && !this.liveBets.some((b) => b.id === bot.id)) {
            const { joinAt: _j, target: _t, ...publicBot } = bot;
            this.liveBets.push(publicBot as EngineBet);
          }
        }
        if (now >= this.bettingEndsAt) this.takeOff(now);
      } else if (this.phase === "flying") {
        this.multiplier = displayMultiplier(now - this.flyingStartedAt);
        const crashed = this.crashPoint !== null && this.multiplier >= this.crashPoint;
        if (!crashed) await this.processAutoCashouts(this.multiplier);
        if (crashed) await this.crash(now);
      } else if (this.phase === "crashed") {
        if (now >= this.crashShownAt + GAME.CRASH_HOLD_MS) {
          this.roundId += 1;
          this.phase = "waiting";
          this.multiplier = 1;
          this.crashPoint = null;
          this.liveBets = [];
          this.bettingEndsAt = Date.now() + GAME.BETTING_MS;
          this.spawnBots();
          this.broadcast("phase", { phase: "waiting" });
          return;
        }
      }
      this.broadcast("state");
    } catch (err) {
      console.error("[engine] tick error", err);
    } finally {
      this.busy = false;
    }
  }

  private takeOff(now: number) {
    this.phase = "flying";
    this.crashPoint = randomCrashPoint();
    this.flyingStartedAt = now;
    this.multiplier = 1;
    this.serverSeed = crypto.randomBytes(16).toString("hex");
    this.flightStartedAt = now;
    this.broadcast("phase", { phase: "flying" });
  }

  serverSeed = "";
  flightStartedAt = 0;

  private async processAutoCashouts(multiplier: number) {
    for (const bet of this.liveBets) {
      if (bet.status !== "pending") continue;
      if (bet.autoCashoutAt == null) continue;
      if (multiplier < bet.autoCashoutAt) continue;
      if (this.crashPoint != null && bet.autoCashoutAt >= this.crashPoint) continue;
      if (bet.simulated) {
        bet.status = "won";
        bet.cashoutAt = bet.autoCashoutAt;
        bet.payout = money(bet.amount * bet.autoCashoutAt);
        this.broadcast("cashout", { betId: bet.id });
      } else {
        await this.settleRealBet(bet, bet.autoCashoutAt);
      }
    }
  }

  private async settleRealBet(bet: EngineBet, atMultiplier: number) {
    const payout = money(bet.amount * atMultiplier);
    // In-memory lock first, then the DB update guarded by status = 'pending'.
    bet.status = "won";
    bet.cashoutAt = atMultiplier;
    bet.payout = payout;
    const [updated] = await db
      .update(bets)
      .set({
        status: "won",
        multiplier: atMultiplier.toFixed(2),
        payout: payout.toFixed(2),
        settledAt: new Date(),
      })
      .where(and(eq(bets.id, bet.id), eq(bets.status, "pending")))
      .returning({ id: bets.id, userId: bets.userId, currency: bets.currency });
    if (!updated) {
      bet.status = "pending";
      bet.cashoutAt = null;
      bet.payout = null;
      return;
    }
    const credited = await creditWallet(updated.userId, payout, updated.currency || bet.currency || "KES");
    await db.update(users).set({ totalWon: sql`${users.totalWon} + ${payout.toFixed(2)}` }).where(eq(users.id, updated.userId));
    await db.insert(transactions).values({
      userId: updated.userId,
      type: "cashout",
      amount: payout.toFixed(2),
      balanceAfter: credited.balance.toFixed(2),
      currency: credited.currency,
      status: "completed",
      method: "aviator",
      reference: `ROUND-${this.roundId}`,
      note: `Cashed out ${bet.amount.toFixed(2)} @ ${atMultiplier.toFixed(2)}x`,
    });
    this.broadcast("cashout", { betId: bet.id });
  }

  private async crash(now: number) {
    const crashPoint = this.crashPoint ?? 1;
    this.phase = "crashed";
    this.multiplier = crashPoint;
    this.crashShownAt = now;
    this.history = [crashPoint, ...this.history].slice(0, 24);
    const durationMs = now - this.flightStartedAt;
    const totalStaked = money(this.liveBets.reduce((s, b) => s + b.amount, 0));
    const totalPaid = money(this.liveBets.reduce((s, b) => s + (b.payout ?? 0), 0));

    for (const bet of this.liveBets) {
      if (bet.status === "pending") {
        bet.status = "lost";
        if (!bet.simulated) {
          await db
            .update(bets)
            .set({ status: "lost", multiplier: crashPoint.toFixed(2), payout: "0.00", settledAt: new Date() })
            .where(and(eq(bets.id, bet.id), eq(bets.status, "pending")));
        }
      }
    }
    try {
      await db.insert(rounds).values({
        id: this.roundId,
        crashPoint: crashPoint.toFixed(2),
        serverSeed: this.serverSeed,
        durationMs,
        betsCount: this.liveBets.length,
        totalStaked: totalStaked.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        startedAt: new Date(this.flightStartedAt),
        endedAt: new Date(now),
      });
    } catch (err) {
      console.error("[engine] round persist failed", err);
    }
    this.broadcast("phase", { phase: "crashed", crashPoint });
  }

  // ---- public API used by route handlers -------------------------------------

  canBet(): boolean {
    return this.phase === "waiting" && Date.now() < this.bettingEndsAt - 400;
  }

  secondsToTakeOff(): number {
    return Math.max(0, (this.bettingEndsAt - Date.now()) / 1000);
  }

  async placeBet(user: { id: number; name: string }, amount: number, autoCashoutAt: number | null) {
    if (!this.canBet()) throw new Error("Betting is closed for this round. Wait for the next one.");
    if (!Number.isFinite(amount) || amount < GAME.MIN_BET || amount > GAME.MAX_BET) {
      throw new Error(`Stake must be between ${GAME.MIN_BET} and ${GAME.MAX_BET.toLocaleString()} KES.`);
    }
    if (autoCashoutAt != null && (autoCashoutAt < 1.01 || autoCashoutAt > GAME.MAX_AUTO_CASHOUT)) {
      throw new Error(`Auto cash-out must be between 1.01x and ${GAME.MAX_AUTO_CASHOUT}x.`);
    }
    const stake = money(amount);
    const currency = await getActiveCurrency(user.id);
    const debit = await debitWallet(user.id, stake, currency);
    if (!debit.ok) throw new Error(debit.error ?? "Insufficient balance. Top up to place this bet.");
    await db
      .update(users)
      .set({ totalStaked: sql`${users.totalStaked} + ${stake.toFixed(2)}`, betsCount: sql`${users.betsCount} + 1` })
      .where(eq(users.id, user.id));

    const [row] = await db
      .insert(bets)
      .values({
        userId: user.id,
        roundId: this.roundId,
        amount: stake.toFixed(2),
        currency,
        autoCashoutAt: autoCashoutAt != null ? autoCashoutAt.toFixed(2) : null,
        autoCashoutEnabled: autoCashoutAt != null,
        status: "pending",
      })
      .returning({ id: bets.id });

    await db.insert(transactions).values({
      userId: user.id,
      type: "bet",
      amount: (-stake).toFixed(2),
      balanceAfter: debit.balance.toFixed(2),
      currency,
      status: "completed",
      method: "aviator",
      reference: `ROUND-${this.roundId}`,
      note: `Stake on round #${this.roundId}${autoCashoutAt ? ` · auto ${autoCashoutAt.toFixed(2)}x` : ""}`,
    });

    const engineBet: EngineBet = {
      id: row.id,
      userId: user.id,
      currency,
      name: maskName(user.name),
      amount: stake,
      autoCashoutAt,
      simulated: false,
      status: "pending",
      cashoutAt: null,
      payout: null,
      placedAt: Date.now(),
    };
    this.liveBets.push(engineBet);
    this.broadcast("bet", { betId: row.id });
    return { betId: row.id, balance: debit.balance, currency, roundId: this.roundId };
  }

  async cashOut(user: { id: number }, betId: number) {
    if (this.phase !== "flying" || this.crashPoint == null) {
      throw new Error("The plane is not in the air.");
    }
    const current = displayMultiplier(Date.now() - this.flightStartedAt);
    if (current >= this.crashPoint) throw new Error("Too late — the plane already flew away.");
    const bet = this.liveBets.find((b) => b.id === betId && b.userId === user.id);
    if (!bet) throw new Error("Bet not found for this round.");
    if (bet.status !== "pending") throw new Error("This bet was already settled.");
    const locked = bet.status;
    bet.status = "won"; // optimistic lock inside the single-threaded loop
    try {
      await this.settleRealBet(bet, current);
    } catch (err) {
      bet.status = locked;
      throw err;
    }
    const [u] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, user.id));
    return { multiplier: current, payout: bet.payout ?? 0, balance: Number(u?.balance ?? 0) };
  }

  cancelBet(betId: number, userId: number): boolean {
    const idx = this.liveBets.findIndex((b) => b.id === betId && b.userId === userId);
    if (idx === -1) return false;
    this.liveBets.splice(idx, 1);
    return true;
  }
}

const globalForEngine = globalThis as typeof globalThis & { __avEngine?: AviatorEngine };

export const engine: AviatorEngine = globalForEngine.__avEngine ?? new AviatorEngine();
globalForEngine.__avEngine = engine;

export function ensureEngine() {
  void engine.start();
  return engine;
}
