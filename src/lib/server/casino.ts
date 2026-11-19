import "server-only";
import crypto from "node:crypto";
import { db } from "@/db";
import { casinoBets, transactions, users } from "@/db/schema";
import { getSettings } from "./settings";
import { creditWallet, debitWallet, getActiveCurrency, refreshMirror } from "./wallet";
import { desc, eq, sql } from "drizzle-orm";
import {
  GAME_META,
  drawCard,
  handTotal,
  hiloPlay,
  kenoPlay,
  limboPlay,
  plinkoPlay,
  roulettePlay,
  slotsPlay,
  type Card,
  type RouletteBet,
} from "./casinoGames";

export type CasinoGame =
  | "dice"
  | "mines"
  | "wheel"
  | "plinko"
  | "roulette"
  | "slots"
  | "limbo"
  | "hilo"
  | "keno";

const uniform = () => crypto.randomInt(0, 1_000_000) / 1_000_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export const WHEEL_SEGMENTS = [
  { key: "0", mult: 0, color: "#0b1020" },
  { key: "1", mult: 1.5, color: "#2b7fff" },
  { key: "2", mult: 0, color: "#0b1020" },
  { key: "3", mult: 2, color: "#16c784" },
  { key: "4", mult: 1.5, color: "#2b7fff" },
  { key: "5", mult: 0, color: "#0b1020" },
  { key: "6", mult: 3, color: "#a855f7" },
  { key: "7", mult: 1.5, color: "#2b7fff" },
  { key: "8", mult: 0, color: "#0b1020" },
  { key: "9", mult: 2, color: "#16c784" },
  { key: "10", mult: 10, color: "#f5b301" },
  { key: "11", mult: 1.5, color: "#2b7fff" },
  { key: "12", mult: 0, color: "#0b1020" },
  { key: "13", mult: 2, color: "#16c784" },
  { key: "14", mult: 1.5, color: "#2b7fff" },
  { key: "15", mult: 0, color: "#0b1020" },
  { key: "16", mult: 5, color: "#e50539" },
  { key: "17", mult: 1.5, color: "#2b7fff" },
];

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let out = 1;
  for (let i = 1; i <= k; i += 1) out = (out * (n - k + i)) / i;
  return out;
}

export function minesMultiplier(mines: number, picks: number, edgePct: number): number {
  const safe = 25 - mines;
  const p = combination(safe, picks) / combination(25, picks);
  return Math.max(1.01, r2((1 - edgePct / 100) / p));
}

export function diceMultiplier(target: number, direction: "over" | "under", edgePct: number): number {
  const winChance = direction === "over" ? (99.99 - target) / 100 : target / 100;
  return Math.max(1.01, r2((1 - edgePct / 100) / Math.max(0.0001, winChance)));
}

export type PlayResult = {
  ok: boolean;
  game: CasinoGame;
  win: boolean;
  multiplier: number;
  payout: number;
  balance: number;
  currency: string;
  detail: Record<string, unknown>;
};

async function record(
  userId: number,
  game: CasinoGame,
  currency: string,
  stake: number,
  payout: number,
  multiplier: number,
  detail: Record<string, unknown>,
  balance: number,
  balanceAfterStake: number,
) {
  await db.insert(casinoBets).values({
    userId,
    game,
    currency,
    stake: stake.toFixed(2),
    payout: payout.toFixed(2),
    multiplier: multiplier.toFixed(3),
    status: payout > stake ? "settled" : payout > 0 ? "partial" : "lost",
    detail,
  });
  const reference = `${game.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  await db.insert(transactions).values({
    userId,
    type: "bet",
    amount: (-stake).toFixed(2),
    currency,
    balanceAfter: balanceAfterStake.toFixed(2),
    status: "completed",
    method: game,
    reference,
    note: `${game} stake`,
  });
  if (payout > 0) {
    await db.insert(transactions).values({
      userId,
      type: "cashout",
      amount: payout.toFixed(2),
      currency,
      balanceAfter: balance.toFixed(2),
      status: "completed",
      method: game,
      reference,
      note: `${game} · ${multiplier.toFixed(2)}x`,
    });
  }
}

export async function playCasino(
  userId: number,
  game: CasinoGame,
  stake: number,
  params: Record<string, unknown>,
): Promise<PlayResult> {
  const settings = await getSettings();
  const currency = await getActiveCurrency(userId);
  const edge = settings.casinoHouseEdgePct;

  if (!Number.isFinite(stake) || stake <= 0) throw new Error("Enter a valid stake.");
  const stakeR = r2(stake);

  const debit = await debitWallet(userId, stakeR, currency);
  if (!debit.ok) throw new Error(debit.error ?? "Insufficient balance.");

  let win = false;
  let multiplier = 0;
  let detail: Record<string, unknown> = {};

  if (game === "dice") {
    const target = Math.min(98, Math.max(2, Number(params.target ?? 50)));
    const direction = params.direction === "under" ? "under" : "over";
    const roll = r2(uniform() * 100);
    multiplier = diceMultiplier(target, direction, edge);
    win = direction === "over" ? roll > target : roll < target;
    detail = { roll, target, direction, multiplier };
  } else if (game === "mines") {
    const mines = Math.min(24, Math.max(1, Math.round(Number(params.mines ?? 3))));
    const picks = Math.min(24 - mines + 1, Math.max(1, Math.round(Number(params.picks ?? 3))));
    multiplier = minesMultiplier(mines, picks, edge);
    // Build a random board and reveal the player's auto-picks.
    const board = Array.from({ length: 25 }, (_, i) => i);
    for (let i = board.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(0, i + 1);
      [board[i], board[j]] = [board[j], board[i]];
    }
    const bombs = new Set(board.slice(0, mines));
    const chosen = board.slice(mines, mines + picks);
    const hit = chosen.findIndex((tile) => bombs.has(tile));
    win = hit === -1;
    detail = { mines, picks, bombs: [...bombs], chosen, hitIndex: hit, multiplier };
  } else if (game === "wheel") {
    const idx = crypto.randomInt(0, WHEEL_SEGMENTS.length);
    const landed = WHEEL_SEGMENTS[idx];
    const chosen = String(params.segment ?? "3");
    const target = WHEEL_SEGMENTS.find((s) => s.key === chosen);
    multiplier = target?.mult ?? 0;
    win = landed.key === chosen && (target?.mult ?? 0) > 0;
    detail = { landedIndex: idx, landed: landed.key, chosen, multiplier };
  } else if (game === "plinko") {
    const rows = [8, 12, 16].includes(Number(params.rows)) ? Number(params.rows) : 12;
    const risk = ["low", "medium", "high"].includes(String(params.risk)) ? String(params.risk) : "medium";
    const out = plinkoPlay(rows, risk);
    multiplier = out.multiplier;
    win = out.multiplier > 1;
    detail = { rows: out.rows, risk: out.risk, path: out.path, bucket: out.bucket, table: out.table, multiplier };
  } else if (game === "roulette") {
    const type = String(params.betType ?? "red");
    const allowed = ["straight", "red", "black", "odd", "even", "low", "high", "dozen", "column"];
    if (!allowed.includes(type)) {
      await creditWallet(userId, stakeR, currency);
      throw new Error("Unknown roulette bet.");
    }
    const bet = { type, value: Number(params.value) } as unknown as RouletteBet;
    const out = roulettePlay(bet, edge);
    win = out.win;
    multiplier = out.multiplier;
    detail = { betType: type, value: params.value ?? null, winning: out.winning, colour: out.colour, payoutFactor: out.payoutFactor };
  } else if (game === "slots") {
    const out = slotsPlay(edge);
    win = out.win;
    multiplier = out.multiplier;
    detail = { grid: out.grid, wins: out.wins };
  } else if (game === "limbo") {
    const out = limboPlay(Number(params.target ?? 2), edge);
    win = out.win;
    multiplier = out.win ? out.target : 0;
    detail = { target: out.target, result: out.result, chance: out.chance };
  } else if (game === "hilo") {
    const guess = ["higher", "lower", "same"].includes(String(params.guess)) ? (String(params.guess) as "higher" | "lower" | "same") : "higher";
    const out = hiloPlay(guess, edge);
    win = out.win;
    multiplier = out.multiplier;
    detail = { card1: out.card1, card2: out.card2, guess, chance: out.chance };
  } else if (game === "keno") {
    const picks = Array.isArray(params.picks) ? (params.picks as number[]) : [];
    if (picks.length < 1) {
      await creditWallet(userId, stakeR, currency);
      throw new Error("Pick at least one number.");
    }
    const out = kenoPlay(picks, edge);
    win = out.win;
    multiplier = out.multiplier;
    detail = { picks: out.picks, drawn: out.drawn, hits: out.hits, paytable: out.paytable };
  } else {
    await creditWallet(userId, stakeR, currency);
    throw new Error("Unknown game.");
  }

  // Any positive multiplier returns money — plinko buckets below 1x are partial returns.
  const payout = multiplier > 0 ? r2(stakeR * multiplier) : 0;
  let balance = debit.balance;
  if (payout > 0) balance = (await creditWallet(userId, payout, currency)).balance;
  await record(userId, game, currency, stakeR, payout, payout > 0 ? multiplier : 0, detail, balance, debit.balance);

  const paid = payout > 0;
  return { ok: true, game, win: paid, multiplier: paid ? multiplier : 0, payout, balance, currency, detail };
}

export async function casinoHistory(userId: number, limit = 40) {
  const rows = await db
    .select()
    .from(casinoBets)
    .where(eq(casinoBets.userId, userId))
    .orderBy(desc(casinoBets.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    game: r.game,
    currency: r.currency,
    stake: Number(r.stake),
    payout: Number(r.payout),
    multiplier: r.multiplier ? Number(r.multiplier) : null,
    detail: r.detail as Record<string, unknown> | null,
    createdAt: r.createdAt,
  }));
}

export async function casinoLeaderboard() {
  const rows = await db
    .select({
      game: casinoBets.game,
      stake: casinoBets.stake,
      payout: casinoBets.payout,
      multiplier: casinoBets.multiplier,
      name: users.name,
      createdAt: casinoBets.createdAt,
    })
    .from(casinoBets)
    .innerJoin(users, eq(users.id, casinoBets.userId))
    .where(sql`${casinoBets.payout} > 0`)
    .orderBy(desc(casinoBets.id))
    .limit(20);
  return rows.map((r) => ({
    game: r.game,
    name: `${r.name.charAt(0).toUpperCase()}***`,
    stake: Number(r.stake),
    payout: Number(r.payout),
    multiplier: Number(r.multiplier ?? 0),
    at: r.createdAt,
  }));
}


/* --------------------------------------------------------------- BLACKJACK */
type BjHand = {
  stake: number;
  currency: string;
  player: Card[];
  dealer: Card[];
  state: "playing" | "done";
  result?: string;
  payout?: number;
  doubled?: boolean;
  betId?: number;
};

const bjHands = new Map<number, BjHand>();

export function getBlackjackHand(userId: number) {
  return bjHands.get(userId) ?? null;
}

function bjOutcome(hand: BjHand): { result: string; payout: number } {
  const p = handTotal(hand.player).total;
  const d = handTotal(hand.dealer).total;
  const stake = hand.stake;
  const isBj = hand.player.length === 2 && p === 21;
  if (p > 21) return { result: "bust", payout: 0 };
  if (isBj && d !== 21) return { result: "blackjack", payout: r2(stake * 2.5) };
  if (d > 21) return { result: "dealer-bust", payout: r2(stake * 2) };
  if (p > d) return { result: "win", payout: r2(stake * 2) };
  if (p === d) return { result: "push", payout: r2(stake) };
  return { result: "lose", payout: 0 };
}

async function finishBlackjack(userId: number, hand: BjHand) {
  hand.state = "done";
  const { result, payout } = bjOutcome(hand);
  hand.result = result;
  hand.payout = payout;
  if (payout > 0) await creditWallet(userId, payout, hand.currency);
  const multiplier = payout > 0 ? r2(payout / hand.stake) : 0;
  await db.insert(casinoBets).values({
    userId,
    game: "blackjack",
    currency: hand.currency,
    stake: hand.stake.toFixed(2),
    payout: payout.toFixed(2),
    multiplier: multiplier.toFixed(3),
    status: payout > hand.stake ? "settled" : payout === hand.stake ? "settled" : "lost",
    detail: { player: hand.player, dealer: hand.dealer, result },
  });
  await db.insert(transactions).values({
    userId,
    type: payout > 0 ? "cashout" : "bet",
    amount: (payout > 0 ? payout : -hand.stake).toFixed(2),
    balanceAfter: "0.00",
    status: "completed",
    method: hand.currency,
    reference: `BJ-${Date.now().toString(36).toUpperCase()}`,
    note: `Blackjack · ${result}`,
  });
  const balance = await refreshMirror(userId);
  bjHands.delete(userId);
  return { result, payout, balance, player: hand.player, dealer: hand.dealer };
}

export async function blackjackAction(userId: number, action: "deal" | "hit" | "stand" | "double", payload: { stake?: number } = {}) {
  const existing = bjHands.get(userId);

  if (action === "deal") {
    if (existing && existing.state === "playing") throw new Error("Finish your current hand first.");
    const currency = await getActiveCurrency(userId);
    const stake = r2(Number(payload.stake));
    if (!Number.isFinite(stake) || stake <= 0) throw new Error("Enter a valid stake.");
    const debit = await debitWallet(userId, stake, currency);
    if (!debit.ok) throw new Error(debit.error ?? "Insufficient balance.");
    const hand: BjHand = { stake, currency, player: [drawCard(), drawCard()], dealer: [drawCard(), drawCard()], state: "playing" };
    bjHands.set(userId, hand);
    if (handTotal(hand.player).total === 21) {
      const done = await finishBlackjack(userId, hand);
      return { state: "done", ...done };
    }
    return {
      state: "playing",
      stake,
      currency,
      balance: debit.balance,
      player: hand.player,
      dealer: [hand.dealer[0], null],
      playerTotal: handTotal(hand.player).total,
    };
  }

  if (!existing || existing.state !== "playing") throw new Error("Deal a hand first.");

  if (action === "hit") {
    existing.player.push(drawCard());
    const total = handTotal(existing.player).total;
    if (total > 21) {
      const done = await finishBlackjack(userId, existing);
      return { state: "done", ...done };
    }
    if (total === 21) {
      while (handTotal(existing.dealer).total < 17) existing.dealer.push(drawCard());
      const done = await finishBlackjack(userId, existing);
      return { state: "done", ...done };
    }
    return {
      state: "playing",
      stake: existing.stake,
      currency: existing.currency,
      player: existing.player,
      dealer: [existing.dealer[0], null],
      playerTotal: total,
    };
  }

  if (action === "double") {
    const extra = await debitWallet(userId, existing.stake, existing.currency);
    if (!extra.ok) throw new Error("Not enough balance to double down.");
    existing.stake = r2(existing.stake * 2);
    existing.doubled = true;
    existing.player.push(drawCard());
    while (handTotal(existing.dealer).total < 17) existing.dealer.push(drawCard());
    const done = await finishBlackjack(userId, existing);
    return { state: "done", ...done };
  }

  // stand
  while (handTotal(existing.dealer).total < 17) existing.dealer.push(drawCard());
  const done = await finishBlackjack(userId, existing);
  return { state: "done", ...done };
}

export { GAME_META };
