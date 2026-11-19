import "server-only";
import crypto from "node:crypto";

/** Cryptographic helpers — every outcome is decided on the server. */
const int = (n: number) => crypto.randomInt(0, n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function fairPrice(winChance: number, edgePct: number, floor = 1.01): number {
  return Math.max(floor, r2((1 - edgePct / 100) / Math.max(0.000001, winChance)));
}

/* ------------------------------------------------------------------ PLINKO */
export const PLINKO_RISKS = ["low", "medium", "high"] as const;
const PLINKO_TABLE: Record<string, Record<number, number[]>> = {
  low: {
    8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  medium: {
    8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  },
  high: {
    8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

export function plinkoPlay(rows: number, risk: string) {
  const r = PLINKO_RISKS.includes(risk as (typeof PLINKO_RISKS)[number]) ? risk : "medium";
  const row = rows === 8 || rows === 12 || rows === 16 ? rows : 12;
  const table = PLINKO_TABLE[r][row];
  const path: number[] = [];
  let pos = 0;
  for (let i = 0; i < row; i += 1) {
    const dir = int(2); // 0 = left, 1 = right
    path.push(dir);
    pos += dir;
  }
  const bucket = pos; // 0..row
  return { rows: row, risk: r, path, bucket, multiplier: table[bucket], table };
}

/* ---------------------------------------------------------------- ROULETTE */
export const ROULETTE_NUMBERS = Array.from({ length: 37 }, (_, i) => i);
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteBet =
  | { type: "straight"; value: number }
  | { type: "red" | "black" | "odd" | "even" | "low" | "high" }
  | { type: "dozen"; value: 1 | 2 | 3 }
  | { type: "column"; value: 1 | 2 | 3 };

export function rouletteOdds(type: string): { chance: number; payout: number } {
  switch (type) {
    case "straight": return { chance: 1 / 37, payout: 36 };
    case "dozen":
    case "column": return { chance: 12 / 37, payout: 3 };
    default: return { chance: 18 / 37, payout: 2 };
  }
}

export function roulettePlay(bet: RouletteBet, edgePct: number) {
  const winning = int(37);
  const isRed = RED.has(winning);
  let win = false;
  if (bet.type === "straight") win = winning === Number(bet.value);
  else if (bet.type === "red") win = isRed;
  else if (bet.type === "black") win = winning !== 0 && !isRed;
  else if (bet.type === "odd") win = winning !== 0 && winning % 2 === 1;
  else if (bet.type === "even") win = winning !== 0 && winning % 2 === 0;
  else if (bet.type === "low") win = winning >= 1 && winning <= 18;
  else if (bet.type === "high") win = winning >= 19 && winning <= 36;
  else if (bet.type === "dozen") {
    const d = winning === 0 ? 0 : Math.ceil(winning / 12);
    win = d === Number(bet.value);
  } else if (bet.type === "column") {
    const c = winning === 0 ? 0 : (((winning - 1) % 3) + 1);
    win = c === Number(bet.value);
  }
  const odds = rouletteOdds(bet.type);
  // Apply the house edge consistently across all bet types.
  const multiplier = win ? r2(odds.payout * (1 - edgePct / 100) + (odds.payout === 36 ? 1 : 1)) : 0;
  return { winning, colour: winning === 0 ? "green" : isRed ? "red" : "black", win, multiplier: win ? multiplier : 0, payoutFactor: odds.payout };
}

/* ------------------------------------------------------------------- SLOTS */
export const SLOT_SYMBOLS = [
  { id: "🍒", name: "cherry", weight: 26, pay3: 2, pay4: 4, pay5: 8 },
  { id: "🍋", name: "lemon", weight: 22, pay3: 3, pay4: 6, pay5: 12 },
  { id: "🔔", name: "bell", weight: 18, pay3: 5, pay4: 10, pay5: 20 },
  { id: "💎", name: "diamond", weight: 14, pay3: 8, pay4: 16, pay5: 32 },
  { id: "7️⃣", name: "seven", weight: 10, pay3: 15, pay4: 30, pay5: 60 },
  { id: "👑", name: "crown", weight: 6, pay3: 25, pay4: 50, pay5: 120 },
  { id: "✈️", name: "aviator", weight: 4, pay3: 50, pay4: 100, pay5: 250 },
];
const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0);

function spinSymbol() {
  let r = int(TOTAL_WEIGHT);
  for (const s of SLOT_SYMBOLS) {
    if (r < s.weight) return s;
    r -= s.weight;
  }
  return SLOT_SYMBOLS[0];
}

export function slotsPlay(edgePct: number) {
  const grid: string[][] = [];
  for (let reel = 0; reel < 5; reel += 1) {
    const col: string[] = [];
    for (let row = 0; row < 3; row += 1) col.push(spinSymbol().id);
    grid.push(col);
  }
  // paylines: three horizontals plus two diagonals
  const lines = [
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
  ];
  let totalMult = 0;
  const wins: { line: number; symbol: string; count: number; mult: number }[] = [];
  lines.forEach((line, li) => {
    const symbols = line.map((row, reel) => grid[reel][row]);
    const first = symbols[0];
    let count = 1;
    for (let i = 1; i < symbols.length; i += 1) {
      if (symbols[i] === first) count += 1;
      else break;
    }
    if (count >= 3) {
      const def = SLOT_SYMBOLS.find((s) => s.id === first)!;
      const mult = count === 3 ? def.pay3 : count === 4 ? def.pay4 : def.pay5;
      totalMult += mult;
      wins.push({ line: li, symbol: first, count, mult });
    }
  });
  const multiplier = r2(totalMult * (1 - edgePct / 100));
  return { grid, wins, multiplier: multiplier > 0 ? Math.max(1.01, multiplier) : 0, win: multiplier > 0 };
}

/* ------------------------------------------------------------------- LIMBO */
export function limboPlay(target: number, edgePct: number) {
  const t = Math.max(1.01, Math.min(10000, Number(target) || 2));
  const chance = (1 - edgePct / 100) / t;
  const roll = r3(1 + int(1_000_000) / 10000); // 1.0000 .. 100.9999 style
  const result = r2(Math.max(1, (int(1_000_000) / 1_000_000) * 100));
  const win = result >= t;
  return { target: r2(t), chance: r2(chance * 100), result: result || 1, roll, win, multiplier: win ? t : 0 };
}

/* -------------------------------------------------------------------- HILO */
export const CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const CARD_SUITS = ["♠", "♥", "♦", "♣"];

export function hiloPlay(guess: "higher" | "lower" | "same", edgePct: number) {
  const c1 = int(13);
  const c2 = int(13);
  const rankValue = (i: number) => i + 1; // A=1 … K=13
  const a = rankValue(c1);
  const b = rankValue(c2);
  const pHigher = (13 - a) / 13;
  const pLower = (a - 1) / 13;
  const pSame = 1 / 13;
  const chance = guess === "higher" ? Math.max(pHigher, 0.0001) : guess === "lower" ? Math.max(pLower, 0.0001) : pSame;
  const win = guess === "higher" ? b > a : guess === "lower" ? b < a : b === a;
  return {
    card1: { rank: CARD_RANKS[c1], suit: CARD_SUITS[int(4)], value: a },
    card2: { rank: CARD_RANKS[c2], suit: CARD_SUITS[int(4)], value: b },
    guess,
    chance: r2(chance * 100),
    multiplier: fairPrice(chance, edgePct),
    win,
  };
}

/* -------------------------------------------------------------------- KENO */
export function kenoPaytable(picks: number, hits: number): number {
  const tables: Record<number, number[]> = {
    1: [0, 3.5],
    2: [0, 0, 8],
    3: [0, 0, 2, 14],
    4: [0, 0, 1.5, 5, 40],
    5: [0, 0, 1.2, 3, 12, 90],
    6: [0, 0, 0, 2, 5, 20, 200],
    7: [0, 0, 0, 1.5, 3, 10, 40, 400],
    8: [0, 0, 0, 1.2, 2.5, 6, 20, 90, 800],
    9: [0, 0, 0, 1, 2, 4, 10, 40, 180, 1500],
    10: [0, 0, 0, 0, 1.8, 3.5, 8, 25, 90, 400, 3000],
  };
  const t = tables[picks] ?? tables[5];
  return t[Math.min(hits, t.length - 1)] ?? 0;
}

export function kenoPlay(picked: number[], edgePct: number) {
  const picks = Array.from(new Set(picked.map((n) => Math.floor(Number(n))).filter((n) => n >= 1 && n <= 80))).slice(0, 10);
  const pool = Array.from({ length: 80 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = int(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const drawn = pool.slice(0, 20).sort((a, b) => a - b);
  const hits = picks.filter((p) => drawn.includes(p));
  const raw = kenoPaytable(picks.length, hits.length);
  const multiplier = raw > 0 ? Math.max(1.01, r2(raw * (1 - edgePct / 100))) : 0;
  return { picks, drawn, hits: hits.sort((a, b) => a - b), multiplier, win: multiplier > 0, paytable: Array.from({ length: picks.length + 1 }, (_, i) => kenoPaytable(picks.length, i)) };
}

/* --------------------------------------------------------------- BLACKJACK */
export type Card = { rank: string; suit: string; value: number };

export function drawCard(): Card {
  const i = int(13);
  const value = i === 0 ? 11 : i >= 9 ? 10 : i + 1;
  return { rank: CARD_RANKS[i], suit: CARD_SUITS[int(4)], value };
}

export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = cards.reduce((s, c) => s + c.value, 0);
  let aces = cards.filter((c) => c.rank === "A").length;
  let soft = aces > 0 && total <= 21;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
    soft = aces > 0 && total <= 21;
  }
  return { total, soft };
}

/* -------------------------------------------------------------------- META */
export const GAME_META: Record<
  string,
  { id: string; name: string; emoji: string; category: string; tag: string; blurb: string; accent: string; badge?: string }
> = {
  aviator: { id: "aviator", name: "Aviator", emoji: "✈️", category: "crash", tag: "Crash game", blurb: "Cash out before the plane flies away. Up to 200x.", accent: "from-rose-600/45", badge: "HOT" },
  crashx: { id: "crashx", name: "Crash X", emoji: "🚀", category: "crash", tag: "Crash game", blurb: "The rocket climbs — take profit before it explodes.", accent: "from-indigo-600/45" },
  dice: { id: "dice", name: "Dice", emoji: "🎲", category: "instant", tag: "Instant win", blurb: "Roll over or under your target for up to 98x.", accent: "from-sky-600/40" },
  mines: { id: "mines", name: "Mines", emoji: "💣", category: "instant", tag: "Instant win", blurb: "Reveal gems, dodge the bombs. Each pick multiplies.", accent: "from-emerald-600/40", badge: "TOP" },
  wheel: { id: "wheel", name: "Wheel", emoji: "🎡", category: "instant", tag: "Instant win", blurb: "18 segments, top prize 10x on the gold slot.", accent: "from-amber-500/40" },
  plinko: { id: "plinko", name: "Plinko", emoji: "🔻", category: "instant", tag: "Drop game", blurb: "Drop the ball through the pegs — up to 1000x.", accent: "from-fuchsia-600/40", badge: "NEW" },
  limbo: { id: "limbo", name: "Limbo", emoji: "📈", category: "instant", tag: "Instant win", blurb: "Set your target multiplier, up to 10,000x.", accent: "from-cyan-600/40", badge: "NEW" },
  hilo: { id: "hilo", name: "Hi-Lo", emoji: "🃏", category: "cards", tag: "Card game", blurb: "Higher, lower or the same card — up to 13x.", accent: "from-violet-600/40", badge: "NEW" },
  blackjack: { id: "blackjack", name: "Blackjack", emoji: "🂡", category: "cards", tag: "Table game", blurb: "Beat the dealer to 21. Blackjack pays 3:2.", accent: "from-emerald-700/45", badge: "NEW" },
  roulette: { id: "roulette", name: "Roulette", emoji: "🎰", category: "table", tag: "European table", blurb: "Straight up 36x, dozens, columns, colours.", accent: "from-red-700/45", badge: "NEW" },
  slots: { id: "slots", name: "Lucky Reels", emoji: "🎰", category: "slots", tag: "5-reel slot", blurb: "5 reels, 5 paylines, top symbol pays 250x.", accent: "from-orange-600/45", badge: "NEW" },
  keno: { id: "keno", name: "Keno", emoji: "🔢", category: "lottery", tag: "Lottery", blurb: "Pick up to 10 numbers from 80 — up to 3000x.", accent: "from-blue-700/45", badge: "NEW" },
};

export const GAME_CATEGORIES = [
  { key: "all", label: "All games" },
  { key: "crash", label: "Crash" },
  { key: "instant", label: "Instant win" },
  { key: "cards", label: "Cards" },
  { key: "table", label: "Table" },
  { key: "slots", label: "Slots" },
  { key: "lottery", label: "Lottery" },
];

export function gameMeta(id: string) {
  return GAME_META[id] ?? GAME_META.dice;
}
