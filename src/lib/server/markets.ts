import "server-only";
import crypto from "node:crypto";

/* ------------------------------------------------------------------ types */
export type Selection = { key: string; name: string; price: number };
export type Market = {
  key: string;
  name: string;
  short: string;
  group: string;
  type: string;
  line?: number;
  selections: Selection[];
};
export type Leg = {
  eventId: number;
  sport: string;
  league: string;
  home: string;
  away: string;
  marketKey: string;
  marketName: string;
  selKey: string;
  selName: string;
  line?: number;
  price: number;
  status?: "pending" | "won" | "lost" | "void";
};

export type MarketGroup = { key: string; label: string };
export const MARKET_GROUPS: MarketGroup[] = [
  { key: "main", label: "Main" },
  { key: "totals", label: "Totals" },
  { key: "handicaps", label: "Handicaps" },
  { key: "halves", label: "1st Half" },
  { key: "scores", label: "Scores & combos" },
  { key: "specials", label: "Specials" },
];

/* ------------------------------------------------------------------ maths */
const r2 = (n: number) => Math.round(n * 100) / 100;
const fact = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
const poisson = (l: number, k: number) => (Math.exp(-l) * Math.pow(l, k)) / (fact[k] ?? 1);

function teamStrength(name: string): number {
  const h = crypto.createHash("sha1").update(name).digest();
  return (h.readUInt32BE(0) % 1000) / 1000;
}

function scoreMatrix(lh: number, la: number, max = 8): number[][] {
  const m: number[][] = [];
  for (let h = 0; h <= max; h += 1) {
    m.push([]);
    for (let a = 0; a <= max; a += 1) m[h].push(poisson(lh, h) * poisson(la, a));
  }
  return m;
}

function price(prob: number, marginPct: number, floor = 1.01): number {
  const p = Math.max(0.0001, Math.min(0.9995, prob));
  return Math.max(floor, r2((1 / p) * (1 - marginPct / 100)));
}

const res = (h: number, a: number) => (h > a ? "1" : h === a ? "X" : "2");

/* ------------------------------------------------- football market builder */
export function buildFootballMarkets(home: string, away: string, marginPct: number): Market[] {
  const diff = teamStrength(home) - teamStrength(away);
  const lh = Math.max(0.22, 1.38 + diff * 1.55);
  const la = Math.max(0.18, 1.12 - diff * 1.35);
  const m = scoreMatrix(lh, la);
  const ht = scoreMatrix(lh / 2, la / 2, 7);
  const out: Market[] = [];
  const add = (mk: Market) => out.push(mk);

  /* accumulate every probability we need in one pass */
  let p1 = 0, pX = 0, p2 = 0, pBtts = 0, pOdd = 0;
  const totals: Record<string, { over: number; under: number }> = {};
  const tt: Record<string, { over: number; under: number }> = {};
  const ah: Record<string, { h: number; a: number; v: number }> = {};
  const eh: Record<string, { h: number; d: number; a: number }> = {};
  const cs: Record<string, number> = {};
  const ranges: Record<string, number> = { "0-1": 0, "2-3": 0, "4-6": 0, "7+": 0 };
  let wtnH = 0, wtnA = 0;
  const combo: Record<string, number> = { yes1: 0, yes2: 0, no1: 0, no2: 0, noX: 0 };

  for (let h = 0; h < m.length; h += 1) {
    for (let a = 0; a < m[h].length; a += 1) {
      const p = m[h][a];
      const r = res(h, a);
      if (r === "1") p1 += p; else if (r === "X") pX += p; else p2 += p;
      const total = h + a;
      if (h > 0 && a > 0) pBtts += p;
      if (total % 2 === 1) pOdd += p;
      if (total <= 1) ranges["0-1"] += p;
      else if (total <= 3) ranges["2-3"] += p;
      else if (total <= 6) ranges["4-6"] += p;
      else ranges["7+"] += p;
      if (h > a && a === 0) wtnH += p;
      if (a > h && h === 0) wtnA += p;
      if (h > 0 && a > 0) { if (r === "1") combo.yes1 += p; else if (r === "2") combo.yes2 += p; }
      else { if (r === "1") combo.no1 += p; else if (r === "2") combo.no2 += p; else combo.noX += p; }

      cs[`${h}:${a}`] = (cs[`${h}:${a}`] ?? 0) + p;
      for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
        const k = String(line);
        totals[k] = totals[k] ?? { over: 0, under: 0 };
        if (total > line) totals[k].over += p; else totals[k].under += p;
      }
      for (const line of [0.5, 1.5, 2.5]) {
        const k = String(line);
        tt[`h${k}`] = tt[`h${k}`] ?? { over: 0, under: 0 };
        tt[`a${k}`] = tt[`a${k}`] ?? { over: 0, under: 0 };
        if (h > line) tt[`h${k}`].over += p; else tt[`h${k}`].under += p;
        if (a > line) tt[`a${k}`].over += p; else tt[`a${k}`].under += p;
      }
      for (const line of [-1.5, -0.5, 0.5, 1.5]) {
        const k = String(line);
        ah[k] = ah[k] ?? { h: 0, a: 0, v: 0 };
        const adj = h + line;
        if (adj > a) ah[k].h += p; else if (adj < a) ah[k].a += p; else ah[k].v += p;
      }
      for (const line of [-2, -1, 1, 2]) {
        const k = String(line);
        eh[k] = eh[k] ?? { h: 0, d: 0, a: 0 };
        const adj = h + line;
        if (adj > a) eh[k].h += p; else if (adj === a) eh[k].d += p; else eh[k].a += p;
      }
    }
  }

  /* half-time distributions */
  let h1 = 0, hX = 0, h2 = 0;
  const htTotals: Record<string, { over: number; under: number }> = {};
  for (let h = 0; h < ht.length; h += 1) {
    for (let a = 0; a < ht[h].length; a += 1) {
      const p = ht[h][a];
      const r = res(h, a);
      if (r === "1") h1 += p; else if (r === "X") hX += p; else h2 += p;
      for (const line of [0.5, 1.5, 2.5]) {
        const k = String(line);
        htTotals[k] = htTotals[k] ?? { over: 0, under: 0 };
        if (h + a > line) htTotals[k].over += p; else htTotals[k].under += p;
      }
    }
  }

  /* HT/FT joint distribution (two independent halves) */
  const htft: Record<string, number> = {};
  for (let a1 = 0; a1 < ht.length; a1 += 1)
    for (let b1 = 0; b1 < ht[a1].length; b1 += 1) {
      const p1h = ht[a1][b1];
      if (p1h < 1e-6) continue;
      for (let a2 = 0; a2 < ht.length; a2 += 1)
        for (let b2 = 0; b2 < ht[a2].length; b2 += 1) {
          const p = p1h * ht[a2][b2];
          if (p < 1e-7) continue;
          const k = `${res(a1, b1)}/${res(a1 + a2, b1 + b2)}`;
          htft[k] = (htft[k] ?? 0) + p;
        }
    }

  /* ------------------------------------------------------------- markets */
  add({ key: "1x2", name: "Full Time Result", short: "1X2", group: "main", type: "3way", selections: [
    { key: "1", name: home, price: price(p1, marginPct) },
    { key: "X", name: "Draw", price: price(pX, marginPct) },
    { key: "2", name: away, price: price(p2, marginPct) },
  ]});

  add({ key: "dc", name: "Double Chance", short: "1X", group: "main", type: "double", selections: [
    { key: "1X", name: `${home} or Draw`, price: price(p1 + pX, marginPct) },
    { key: "12", name: `${home} or ${away}`, price: price(p1 + p2, marginPct) },
    { key: "X2", name: `Draw or ${away}`, price: price(pX + p2, marginPct) },
  ]});

  add({ key: "ou", name: "Total Goals Over/Under 2.5", short: "O/U", group: "main", type: "totals", line: 2.5, selections: [
    { key: "over", name: "Over 2.5", price: price(totals["2.5"].over, marginPct) },
    { key: "under", name: "Under 2.5", price: price(totals["2.5"].under, marginPct) },
  ]});

  add({ key: "btts", name: "Both Teams To Score", short: "BTTS", group: "main", type: "btts", selections: [
    { key: "yes", name: "Yes", price: price(pBtts, marginPct) },
    { key: "no", name: "No", price: price(1 - pBtts, marginPct) },
  ]});

  for (const line of [0.5, 1.5, 3.5, 4.5, 5.5]) {
    const t = totals[String(line)];
    add({ key: "ou", name: `Total Goals Over/Under ${line}`, short: "O/U", group: "totals", type: "totals", line, selections: [
      { key: "over", name: `Over ${line}`, price: price(t.over, marginPct) },
      { key: "under", name: `Under ${line}`, price: price(t.under, marginPct) },
    ]});
  }

  add({ key: "oe", name: "Total Goals Odd/Even", short: "O/E", group: "totals", type: "2way", selections: [
    { key: "odd", name: "Odd", price: price(pOdd, marginPct) },
    { key: "even", name: "Even", price: price(1 - pOdd, marginPct) },
  ]});

  add({ key: "range", name: "Total Goals Range", short: "RNG", group: "totals", type: "multi", selections: [
    { key: "0-1", name: "0 - 1 goals", price: price(ranges["0-1"], marginPct) },
    { key: "2-3", name: "2 - 3 goals", price: price(ranges["2-3"], marginPct) },
    { key: "4-6", name: "4 - 6 goals", price: price(ranges["4-6"], marginPct) },
    { key: "7+", name: "7 + goals", price: price(ranges["7+"], marginPct) },
  ]});

  for (const line of [0.5, 1.5, 2.5]) {
    add({ key: "tt_home", name: `${home} Individual Total ${line}`, short: "IT1", group: "totals", type: "totals", line, selections: [
      { key: "over", name: `Over ${line}`, price: price(tt[`h${line}`].over, marginPct) },
      { key: "under", name: `Under ${line}`, price: price(tt[`h${line}`].under, marginPct) },
    ]});
    add({ key: "tt_away", name: `${away} Individual Total ${line}`, short: "IT2", group: "totals", type: "totals", line, selections: [
      { key: "over", name: `Over ${line}`, price: price(tt[`a${line}`].over, marginPct) },
      { key: "under", name: `Under ${line}`, price: price(tt[`a${line}`].under, marginPct) },
    ]});
  }

  for (const line of [-1.5, -0.5, 0.5, 1.5]) {
    const h = ah[String(line)];
    const denom = Math.max(0.0001, 1 - h.v);
    add({ key: "ah", name: `Asian Handicap ${line > 0 ? "+" : ""}${line}`, short: "AH", group: "handicaps", type: "handicap", line, selections: [
      { key: "home", name: `${home} (${line > 0 ? "+" : ""}${line})`, price: price(h.h / denom, marginPct) },
      { key: "away", name: `${away} (${line > 0 ? "+" : ""}${-line})`, price: price(h.a / denom, marginPct) },
    ]});
  }

  for (const line of [-2, -1, 1, 2]) {
    const e = eh[String(line)];
    add({ key: "eh", name: `European Handicap (${line > 0 ? "+" : ""}${line})`, short: "EH", group: "handicaps", type: "3way", line, selections: [
      { key: "1", name: `${home} (${line > 0 ? "+" : ""}${line})`, price: price(e.h, marginPct) },
      { key: "X", name: `Draw (${line > 0 ? "+" : ""}${line})`, price: price(e.d, marginPct) },
      { key: "2", name: `${away} (${-line > 0 ? "+" : ""}${-line})`, price: price(e.a, marginPct) },
    ]});
  }

  add({ key: "dnb", name: "Draw No Bet", short: "DNB", group: "specials", type: "2way", selections: [
    { key: "1", name: home, price: price(p1 / Math.max(0.0001, p1 + p2), marginPct) },
    { key: "2", name: away, price: price(p2 / Math.max(0.0001, p1 + p2), marginPct) },
  ]});

  add({ key: "wtn", name: "Win To Nil", short: "WTN", group: "specials", type: "2way", selections: [
    { key: "home", name: `${home} to nil`, price: price(wtnH, marginPct) },
    { key: "away", name: `${away} to nil`, price: price(wtnA, marginPct) },
  ]});

  add({ key: "btts_res", name: "BTTS + Match Result", short: "BTTS/R", group: "scores", type: "multi", selections: [
    { key: "yes1", name: `Yes & ${home} win`, price: price(combo.yes1, marginPct) },
    { key: "yes2", name: `Yes & ${away} win`, price: price(combo.yes2, marginPct) },
    { key: "no1", name: `No & ${home} win`, price: price(combo.no1, marginPct) },
    { key: "no2", name: `No & ${away} win`, price: price(combo.no2, marginPct) },
    { key: "noX", name: "No & Draw", price: price(combo.noX, marginPct) },
  ]});

  const listed = ["0:0", "1:0", "0:1", "1:1", "2:0", "0:2", "2:1", "1:2", "2:2", "3:0", "0:3", "3:1", "1:3", "3:2", "2:3", "3:3", "4:0", "0:4", "4:1", "1:4"];
  const csSelections = listed.map((k) => ({ key: k, name: k.replace(":", " - "), price: price(cs[k] ?? 0.0005, marginPct, 1.05) }));
  const listedSum = listed.reduce((s, k) => s + (cs[k] ?? 0), 0);
  csSelections.push({ key: "other", name: "Any other score", price: price(Math.max(0.001, 1 - listedSum), marginPct, 1.05) });
  add({ key: "cs", name: "Correct Score", short: "CS", group: "scores", type: "multi", selections: csSelections });

  add({ key: "ht1x2", name: "1st Half Result", short: "HT", group: "halves", type: "3way", selections: [
    { key: "1", name: home, price: price(h1, marginPct) },
    { key: "X", name: "Draw", price: price(hX, marginPct) },
    { key: "2", name: away, price: price(h2, marginPct) },
  ]});

  add({ key: "htdc", name: "1st Half Double Chance", short: "HT DC", group: "halves", type: "double", selections: [
    { key: "1X", name: `${home} or Draw`, price: price(h1 + hX, marginPct) },
    { key: "12", name: `${home} or ${away}`, price: price(h1 + h2, marginPct) },
    { key: "X2", name: `Draw or ${away}`, price: price(hX + h2, marginPct) },
  ]});

  for (const line of [0.5, 1.5]) {
    const t = htTotals[String(line)];
    add({ key: "htou", name: `1st Half Total ${line}`, short: "HT O/U", group: "halves", type: "totals", line, selections: [
      { key: "over", name: `Over ${line}`, price: price(t.over, marginPct) },
      { key: "under", name: `Under ${line}`, price: price(t.under, marginPct) },
    ]});
  }

  add({ key: "htft", name: "Half Time / Full Time", short: "HT/FT", group: "scores", type: "multi", selections: [
    "1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2",
  ].map((k) => ({ key: k, name: k.replace("1", "H").replace("2", "A").replace("X", "D").replace("/", " / "), price: price(htft[k] ?? 0.002, marginPct, 1.05) })) });

  return out;
}

/* --------------------------------------------- other sports (2-way model) */
export function buildGenericMarkets(sport: string, home: string, away: string, marginPct: number): Market[] {
  const sh = teamStrength(home) + 0.06;
  const sa = teamStrength(away);
  const pHome = 1 / (1 + Math.pow(10, ((sa - sh) * 400) / 1000));
  const pDraw = sport === "hockey" ? 0.22 : 0;
  const norm = 1 + pDraw;
  const p1 = (pHome + (pDraw ? pDraw / 2 : 0)) / norm;
  const p2 = (1 - pHome + (pDraw ? pDraw / 2 : 0)) / norm;
  const out: Market[] = [];

  const linesBySport: Record<string, number[]> = {
    basketball: [198.5, 208.5, 218.5],
    tennis: [21.5, 23.5, 25.5],
    cricket: [315.5, 335.5, 355.5],
    rugby: [41.5, 47.5, 53.5],
    esports: [2.5],
    volleyball: [171.5, 181.5],
    baseball: [7.5, 8.5, 9.5],
    hockey: [4.5, 5.5, 6.5],
    boxing: [9.5],
  };
  const lines = linesBySport[sport] ?? [2.5];
  const skew = (teamStrength(home) + teamStrength(away)) / 2 - 0.5;

  if (pDraw > 0) {
    out.push({ key: "1x2", name: "Full Time Result", short: "1X2", group: "main", type: "3way", selections: [
      { key: "1", name: home, price: price(p1, marginPct) },
      { key: "X", name: "Draw", price: price(pDraw / norm, marginPct) },
      { key: "2", name: away, price: price(p2, marginPct) },
    ]});
    out.push({ key: "dc", name: "Double Chance", short: "1X", group: "main", type: "double", selections: [
      { key: "1X", name: `${home} or Draw`, price: price(p1 + pDraw / norm, marginPct) },
      { key: "12", name: `${home} or ${away}`, price: price(p1 + p2, marginPct) },
      { key: "X2", name: `Draw or ${away}`, price: price(pDraw / norm + p2, marginPct) },
    ]});
  } else {
    out.push({ key: "ml", name: "Match Winner", short: "1X2", group: "main", type: "moneyline", selections: [
      { key: "1", name: home, price: price(pHome, marginPct) },
      { key: "2", name: away, price: price(1 - pHome, marginPct) },
    ]});
  }

  for (const line of lines) {
    const pOver = Math.max(0.15, Math.min(0.85, 0.5 + skew * 0.35));
    out.push({ key: "ou", name: `Total ${line}`, short: "O/U", group: "totals", type: "totals", line, selections: [
      { key: "over", name: `Over ${line}`, price: price(pOver, marginPct) },
      { key: "under", name: `Under ${line}`, price: price(1 - pOver, marginPct) },
    ]});
  }

  const hd = sport === "basketball" ? [-8.5, -4.5, 4.5, 8.5] : sport === "rugby" ? [-7.5, -3.5, 3.5] : [-1.5, 1.5];
  for (const line of hd) {
    const pHomeH = Math.max(0.05, Math.min(0.95, pHome + (line > 0 ? 0.22 : -0.22)));
    out.push({ key: "ah", name: `Handicap ${line > 0 ? "+" : ""}${line}`, short: "AH", group: "handicaps", type: "handicap", line, selections: [
      { key: "home", name: `${home} (${line > 0 ? "+" : ""}${line})`, price: price(pHomeH, marginPct) },
      { key: "away", name: `${away} (${-line > 0 ? "+" : ""}${-line})`, price: price(1 - pHomeH, marginPct) },
    ]});
  }

  return out;
}

export function buildMarkets(sport: string, home: string, away: string, marginPct: number): Market[] {
  return sport === "football" ? buildFootballMarkets(home, away, marginPct) : buildGenericMarkets(sport, home, away, marginPct);
}

/* ------------------------------------------------------------ settlement */
export type ScoreLine = { homeScore: number; awayScore: number; htHome: number | null; htAway: number | null; sport: string };

export function settleLeg(leg: Leg, ev: ScoreLine): "won" | "lost" | "void" {
  const h = ev.homeScore;
  const a = ev.awayScore;
  const hh = ev.htHome ?? h;
  const ha = ev.htAway ?? a;
  const line = leg.line ?? 0;
  const k = leg.selKey;

  switch (leg.marketKey) {
    case "1x2":
    case "ml":
      return k === res(h, a) ? "won" : ev.sport === "football" ? "lost" : h === a ? "void" : "lost";
    case "ht1x2":
      return k === res(hh, ha) ? "won" : "lost";
    case "dc":
      if (k === "1X") return h >= a ? "won" : "lost";
      if (k === "12") return h !== a ? "won" : "lost";
      return a >= h ? "won" : "lost";
    case "htdc":
      if (k === "1X") return hh >= ha ? "won" : "lost";
      if (k === "12") return hh !== ha ? "won" : "lost";
      return ha >= hh ? "won" : "lost";
    case "dnb":
      if (h === a) return "void";
      return (k === "1" ? h > a : a > h) ? "won" : "lost";
    case "btts":
      return (h > 0 && a > 0) === (k === "yes") ? "won" : "lost";
    case "btts_res": {
      const both = h > 0 && a > 0;
      const r = res(h, a);
      return k === `yes${r}` && both ? "won" : k === `no${r}` && !both ? "won" : "lost";
    }
    case "wtn":
      if (k === "home") return h > a && a === 0 ? "won" : "lost";
      return a > h && h === 0 ? "won" : "lost";
    case "ou":
    case "htou": {
      const total = leg.marketKey === "htou" ? hh + ha : h + a;
      if (total === line) return "void";
      return (k === "over") === (total > line) ? "won" : "lost";
    }
    case "tt_home":
    case "tt_away": {
      const t = leg.marketKey === "tt_home" ? h : a;
      if (t === line) return "void";
      return (k === "over") === (t > line) ? "won" : "lost";
    }
    case "oe":
      return ((h + a) % 2 === 1) === (k === "odd") ? "won" : "lost";
    case "range": {
      const t = h + a;
      const band = t <= 1 ? "0-1" : t <= 3 ? "2-3" : t <= 6 ? "4-6" : "7+";
      return band === k ? "won" : "lost";
    }
    case "ah": {
      // `line` is always the home team's handicap; away gets the mirror.
      const diff = k === "home" ? h + line - a : a - line - h;
      if (diff === 0) return "void";
      return diff > 0 ? "won" : "lost";
    }
    case "eh": {
      const adj = h + line;
      return k === res(adj, a) ? "won" : "lost";
    }
    case "cs": {
      const score = `${h}:${a}`;
      if (k === "other") return LISTED_SCORES.includes(score) ? "lost" : "won";
      return k === score ? "won" : "lost";
    }
    case "htft":
      return k === `${res(hh, ha)}/${res(h, a)}` ? "won" : "lost";
    default:
      return "lost";
  }
}

/** "Other" correct-score handling: it wins only when the score is outside the listed grid. */
export const LISTED_SCORES = ["0:0", "1:0", "0:1", "1:1", "2:0", "0:2", "2:1", "1:2", "2:2", "3:0", "0:3", "3:1", "1:3", "3:2", "2:3", "3:3", "4:0", "0:4", "4:1", "1:4"];
