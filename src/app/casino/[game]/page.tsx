"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { money, roundMoney } from "@/lib/currency";
import { useApp, useAuth, useToast } from "@/components/providers/AppProviders";

type Result = { win: boolean; multiplier: number; payout: number; detail: Record<string, any> };
type Meta = { id: string; name: string; emoji: string; tag: string; blurb: string; accent: string };

const GAMES: Record<string, { name: string; emoji: string; tag: string; accent: string; blurb: string }> = {
  dice: { name: "Dice", emoji: "🎲", tag: "Instant win", accent: "from-sky-600/40", blurb: "Roll over or under your target." },
  mines: { name: "Mines", emoji: "💣", tag: "Instant win", accent: "from-emerald-600/40", blurb: "Reveal gems, dodge the bombs." },
  wheel: { name: "Wheel", emoji: "🎡", tag: "Instant win", accent: "from-amber-500/40", blurb: "18 segments, top prize 10x." },
  plinko: { name: "Plinko", emoji: "🔻", tag: "Drop game", accent: "from-fuchsia-600/40", blurb: "Drop through the pegs for up to 1000x." },
  roulette: { name: "Roulette", emoji: "🎰", tag: "European table", accent: "from-red-700/45", blurb: "Straight up 36x, dozens, columns, colours." },
  slots: { name: "Lucky Reels", emoji: "🎰", tag: "5-reel slot", accent: "from-orange-600/45", blurb: "5 reels, 5 paylines, top symbol 250x." },
  limbo: { name: "Limbo", emoji: "📈", tag: "Instant win", accent: "from-cyan-600/40", blurb: "Set a target multiplier up to 10,000x." },
  hilo: { name: "Hi-Lo", emoji: "🃏", tag: "Card game", accent: "from-violet-600/40", blurb: "Higher, lower or the same card." },
  keno: { name: "Keno", emoji: "🔢", tag: "Lottery", accent: "from-blue-700/45", blurb: "Pick up to 10 of 80 numbers." },
  blackjack: { name: "Blackjack", emoji: "🂡", tag: "Table game", accent: "from-emerald-700/45", blurb: "Beat the dealer to 21. Blackjack pays 3:2." },
};

const WHEEL = [
  { key: "0", mult: 0, color: "#141b2a" }, { key: "1", mult: 1.5, color: "#2b7fff" }, { key: "2", mult: 0, color: "#141b2a" },
  { key: "3", mult: 2, color: "#16c784" }, { key: "4", mult: 1.5, color: "#2b7fff" }, { key: "5", mult: 0, color: "#141b2a" },
  { key: "6", mult: 3, color: "#a855f7" }, { key: "7", mult: 1.5, color: "#2b7fff" }, { key: "8", mult: 0, color: "#141b2a" },
  { key: "9", mult: 2, color: "#16c784" }, { key: "10", mult: 10, color: "#f5b301" }, { key: "11", mult: 1.5, color: "#2b7fff" },
  { key: "12", mult: 0, color: "#141b2a" }, { key: "13", mult: 2, color: "#16c784" }, { key: "14", mult: 1.5, color: "#2b7fff" },
  { key: "15", mult: 0, color: "#141b2a" }, { key: "16", mult: 5, color: "#e50539" }, { key: "17", mult: 1.5, color: "#2b7fff" },
];
const PLINKO_TABLE: Record<string, Record<number, number[]>> = {
  low: { 8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6], 12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10], 16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16] },
  medium: { 8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13], 12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33], 16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110] },
  high: { 8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29], 12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170], 16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000] },
};
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SLOT_ICONS = ["🍒", "🍋", "🔔", "💎", "7️⃣", "👑", "✈️"];

function diceMult(target: number, dir: "over" | "under", edge = 3) {
  const chance = dir === "over" ? (99.99 - target) / 100 : target / 100;
  return Math.max(1.01, Math.round(((1 - edge / 100) / Math.max(0.0001, chance)) * 100) / 100);
}
function comb(n: number, k: number) {
  let out = 1;
  for (let i = 1; i <= k; i += 1) out = (out * (n - k + i)) / i;
  return out;
}
function minesMult(mines: number, picks: number, edge = 3) {
  return Math.max(1.01, Math.round(((1 - edge / 100) / (comb(25 - mines, picks) / comb(25, picks))) * 100) / 100);
}

/* ------------------------------------------------------------------ shell */
function Shell({ id, children }: { id: string; children: (ctx: Ctx) => React.ReactNode }) {
  return <GameHost id={id} render={children} />;
}

type Ctx = {
  stake: number;
  setStake: (n: number) => void;
  busy: boolean;
  result: Result | null;
  play: (params: Record<string, unknown>) => Promise<Result | null>;
  history: Result[];
  balance: number;
  currency: string;
  canPlay: boolean;
  login: () => void;
  fmt: (n: number) => string;
  setResult: (r: Result | null) => void;
};

function GameHost({ id, render }: { id: string; render: (ctx: Ctx) => React.ReactNode }) {
  const { user, refresh } = useAuth();
  const { activeCurrency, activeWallet, openGate } = useApp();
  const { push } = useToast();
  const g = GAMES[id] ?? GAMES.dice;
  const [stake, setStake] = useState(activeCurrency === "KES" ? 100 : 1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const balance = activeWallet?.balance ?? user?.balance ?? 0;

  useEffect(() => setStake(activeCurrency === "KES" ? 100 : 1), [activeCurrency]);

  const play = useCallback(
    async (params: Record<string, unknown>) => {
      if (!user) {
        openGate("Log in to play for real money.");
        return null;
      }
      if (stake <= 0 || stake > balance) {
        push(stake > balance ? `Not enough ${activeCurrency}.` : "Enter a stake.", "error");
        return null;
      }
      setBusy(true);
      setResult(null);
      const res = await api<Result & { error?: string }>("/api/casino/play", {
        method: "POST",
        json: { game: id, stake, params },
      });
      setBusy(false);
      if (!res.ok) {
        push(errorMessage(res.data, "Round failed."), "error");
        return null;
      }
      const out: Result = { win: res.data.win, multiplier: res.data.multiplier, payout: res.data.payout, detail: res.data.detail };
      setResult(out);
      setHistory((h) => [out, ...h].slice(0, 10));
      await refresh();
      push(out.win ? `You won ${money(out.payout, activeCurrency)} at ${out.multiplier.toFixed(2)}x!` : "No win this round.", out.win ? "success" : "info");
      return out;
    },
    [user, stake, balance, id, activeCurrency, openGate, push, refresh],
  );

  const ctx: Ctx = {
    stake,
    setStake,
    busy,
    result,
    play,
    history,
    balance,
    currency: activeCurrency,
    canPlay: Boolean(user),
    login: () => openGate("Log in to play for real money."),
    fmt: (n: number) => money(n, activeCurrency),
    setResult,
  };

  return (
    <div className="mx-auto max-w-[1400px] px-2 py-3 sm:px-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/casino" className="btn btn-ghost h-9 px-3 text-[11px] uppercase">← Casino</Link>
        <span className="text-2xl">{g.emoji}</span>
        <div>
          <h1 className="font-display text-lg font-black text-white">{g.name}</h1>
          <p className="text-[11px] text-mist">{g.tag} · {g.blurb}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-mist">Balance</p>
          <p className="tabular text-base font-black text-brand-gold">{money(balance, activeCurrency)}</p>
        </div>
      </div>

      <div className={`panel tile-glow relative overflow-hidden bg-gradient-to-br ${g.accent} via-[#0c1424] to-[#080d18] p-3 sm:p-4`}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">{render(ctx)}</div>
          <div className="grid gap-3">
            <StakeBox ctx={ctx} />
            <div className="panel-flat p-3">
              <p className="label mb-2">Recent rounds</p>
              <div className="grid gap-1.5">
                {history.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-mist">Play a round to see results.</p>
                ) : (
                  history.map((h, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-[#1e2b47] bg-[#0b1322] px-2.5 py-1.5">
                      <span className={`tabular text-xs font-black ${h.multiplier > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {h.multiplier > 0 ? `${h.multiplier.toFixed(2)}x` : "loss"}
                      </span>
                      <span className={`tabular text-[11px] font-bold ${h.payout > 0 ? "text-emerald-400" : "text-mist"}`}>
                        {h.payout > 0 ? `+${ctx.fmt(h.payout)}` : `−${ctx.fmt(stake)}`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StakeBox({ ctx }: { ctx: Ctx }) {
  return (
    <div className="panel-flat p-3">
      <p className="label mb-2">Your stake</p>
      <div className="mb-2 flex gap-1.5">
        {[0.5, 2, 5].map((f) => (
          <button key={f} onClick={() => ctx.setStake(roundMoney(Math.max(0.01, ctx.stake * f), ctx.currency))} className="flex-1 rounded-lg border border-[#243352] bg-[#0b1322] py-1.5 text-[11px] font-bold text-mist hover:text-white">
            {f === 0.5 ? "½" : `${f}×`}
          </button>
        ))}
        <button onClick={() => ctx.setStake(roundMoney(ctx.balance, ctx.currency))} className="flex-1 rounded-lg border border-[#243352] bg-[#0b1322] py-1.5 text-[11px] font-black text-brand-gold">
          MAX
        </button>
      </div>
      <div className="relative">
        <input type="number" min={0} value={ctx.stake} onChange={(e) => ctx.setStake(Number(e.target.value))} className="input tabular pr-16 text-lg font-black" />
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[11px] font-black text-mist">{ctx.currency}</span>
      </div>
      <div className="mt-3 flex justify-between rounded-lg border border-[#243352] bg-[#0b1322] px-3 py-2 text-[11px] font-bold">
        <span className="text-mist">Currency</span>
        <span className="text-brand-gold">{ctx.currency}</span>
      </div>
      <p className="mt-2 text-center text-[10px] text-mist">
        {ctx.canPlay ? "Rounds settle instantly on the server" : "Guest mode — log in to stake real money"}
      </p>
    </div>
  );
}

function ResultBanner({ ctx }: { ctx: Ctx }) {
  if (!ctx.result) return null;
  const r = ctx.result;
  const returned = r.payout > 0;
  const profit = r.payout >= ctx.stake;
  const label = profit ? "You win" : returned ? "Partial return" : "No win";
  return (
    <div
      className={`animate-pop rounded-xl border px-3 py-2 text-center ${
        profit
          ? "border-emerald-500/50 bg-emerald-950/50"
          : returned
            ? "border-amber-500/50 bg-amber-950/40"
            : "border-rose-500/50 bg-rose-950/45"
      }`}
    >
      <p
        className={`text-[10px] font-black uppercase tracking-[0.3em] ${
          profit ? "text-emerald-300" : returned ? "text-amber-300" : "text-rose-300"
        }`}
      >
        {label}
      </p>
      <p className={`tabular font-display text-3xl font-black ${r.multiplier > 0 ? "text-brand-gold" : "text-slate-500"}`}>
        {r.multiplier > 0 ? `${r.multiplier.toFixed(2)}x` : "0.00x"}
      </p>
      <p className="tabular text-xs font-bold text-white">
        {returned ? `+${ctx.fmt(r.payout)}` : `−${ctx.fmt(ctx.stake)}`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- DICE */
function DiceGame(ctx: Ctx) {
  const [target, setTarget] = useState(50);
  const [dir, setDir] = useState<"over" | "under">("over");
  const mult = diceMult(target, dir);
  const roll = ctx.result ? Number(ctx.result.detail.roll ?? 0) : null;
  return (
    <div className="grid gap-3">
      <div className="relative grid h-40 place-items-center rounded-2xl border border-[#1e2b47] bg-[#070c16]">
        <p className={`tabular font-display text-6xl font-black ${roll === null ? "text-slate-700" : ctx.result?.win ? "text-emerald-400" : "text-rose-400"}`}>
          {roll === null ? "--.--" : roll.toFixed(2)}
        </p>
        <p className="absolute bottom-3 text-[11px] font-bold text-mist">
          Target {target}.00 · roll {dir} · <span className="text-brand-gold">{mult.toFixed(4)}x</span>
        </p>
      </div>
      <div className="flex gap-1.5">
        {(["under", "over"] as const).map((d) => (
          <button key={d} onClick={() => setDir(d)} className={`flex-1 rounded-xl border py-2.5 text-xs font-black uppercase ${dir === d ? "border-brand-gold bg-brand-gold/15 text-white" : "border-[#243352] bg-[#0b1322] text-mist"}`}>
            Roll {d}
          </button>
        ))}
      </div>
      <div>
        <input type="range" min={2} max={98} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full accent-[#3d8bfd]" />
        <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-rose-600 via-brand-gold to-emerald-500">
          <div className="absolute -top-1 h-4.5 w-1.5 rounded bg-white shadow" style={{ left: `${target}%`, height: "18px", top: "-4px" }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-bold text-mist">
          <span>Win chance {(dir === "over" ? 99.99 - target : target).toFixed(2)}%</span>
          <span>Payout {mult.toFixed(4)}x</span>
        </div>
      </div>
      <ResultBanner ctx={ctx} />
      <button onClick={() => void ctx.play({ target, direction: dir })} disabled={ctx.busy} className="btn btn-green h-13 w-full py-3.5 text-sm uppercase">
        {ctx.busy ? "Rolling…" : ctx.canPlay ? `Roll dice · ${ctx.fmt(ctx.stake)}` : "Log in to play"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ MINES */
function MinesGame(ctx: Ctx) {
  const [mines, setMines] = useState(3);
  const [picks, setPicks] = useState(3);
  const mult = minesMult(mines, picks);
  const d = ctx.result?.detail as { bombs?: number[]; chosen?: number[] } | undefined;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="label mb-1">Mines</p>
          <input type="number" min={1} max={24} value={mines} onChange={(e) => setMines(Math.max(1, Math.min(24, Number(e.target.value))))} className="input tabular" />
        </div>
        <div>
          <p className="label mb-1">Safe picks</p>
          <input type="number" min={1} max={24} value={picks} onChange={(e) => setPicks(Math.max(1, Math.min(24 - mines, Number(e.target.value))))} className="input tabular" />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1.5 rounded-2xl border border-[#1e2b47] bg-[#070c16] p-2.5">
        {Array.from({ length: 25 }).map((_, i) => {
          const bomb = d?.bombs?.includes(i);
          const gem = d?.chosen?.includes(i);
          return (
            <div key={i} className={`grid h-12 place-items-center rounded-lg border text-lg transition ${bomb ? "animate-pop border-rose-500/70 bg-rose-950/60" : gem ? "animate-pop border-emerald-500/70 bg-emerald-950/50" : "border-[#1e2b47] bg-[#0b1322]"}`}>
              {ctx.result ? (bomb ? "💣" : gem ? "💎" : "") : ""}
            </div>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-mist">
        {mines} bombs · {picks} picks · payout <span className="tabular font-black text-brand-gold">{mult.toFixed(2)}x</span> = {ctx.fmt(ctx.stake * mult)}
      </p>
      <ResultBanner ctx={ctx} />
      <button onClick={() => void ctx.play({ mines, picks })} disabled={ctx.busy} className="btn btn-green h-13 w-full py-3.5 text-sm uppercase">
        {ctx.busy ? "Revealing…" : ctx.canPlay ? `Play mines · ${ctx.fmt(ctx.stake)}` : "Log in to play"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ WHEEL */
function WheelGame(ctx: Ctx) {
  const [seg, setSeg] = useState("3");
  const [spin, setSpin] = useState(0);
  const mult = Number(WHEEL.find((w) => w.key === seg)?.mult ?? 0);
  const landed = ctx.result ? Number(ctx.result.detail.landedIndex ?? 0) : null;
  useEffect(() => {
    if (landed === null) return;
    setSpin((s) => s + 1440 + (18 - landed) * 20);
  }, [landed, ctx.result]);
  return (
    <div className="grid gap-3">
      <div className="relative mx-auto grid h-56 w-56 place-items-center">
        <div
          className="h-56 w-56 rounded-full border-4 border-[#243352] shadow-[0_0_45px_rgba(61,139,253,0.25)]"
          style={{
            background: "conic-gradient(from 0deg, #141b2a 0 20deg, #2b7fff 20deg 40deg, #141b2a 40deg 60deg, #16c784 60deg 80deg, #2b7fff 80deg 100deg, #141b2a 100deg 120deg, #a855f7 120deg 140deg, #2b7fff 140deg 160deg, #141b2a 160deg 180deg, #16c784 180deg 200deg, #f5b301 200deg 220deg, #2b7fff 220deg 240deg, #141b2a 240deg 260deg, #16c784 260deg 280deg, #2b7fff 280deg 300deg, #141b2a 300deg 320deg, #e50539 320deg 340deg, #2b7fff 340deg 360deg)",
            transform: `rotate(${spin}deg)`,
            transition: "transform 3.2s cubic-bezier(0.15, 0.9, 0.2, 1)",
          }}
        />
        <div className="absolute grid h-28 w-28 place-items-center rounded-full bg-[#070c16] text-center ring-2 ring-[#243352]">
          <span className="tabular text-3xl font-black text-white">{ctx.result ? String(ctx.result.detail.landed ?? "-") : seg}</span>
          <span className="text-[10px] font-bold text-brand-gold">{mult.toFixed(2)}x</span>
        </div>
        <span className="absolute -top-1 text-xl text-brand-gold drop-shadow">▼</span>
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {WHEEL.map((w) => (
          <button key={w.key} onClick={() => setSeg(w.key)} className={`tabular rounded-lg border px-2 py-1 text-[11px] font-black ${seg === w.key ? "border-brand-gold text-white" : "border-[#243352] text-mist"}`} style={{ background: w.color }}>
            {w.mult ? `${w.mult}x` : "0"}
          </button>
        ))}
      </div>
      <ResultBanner ctx={ctx} />
      <button onClick={() => void ctx.play({ segment: seg })} disabled={ctx.busy} className="btn btn-green h-13 w-full py-3.5 text-sm uppercase">
        {ctx.busy ? "Spinning…" : ctx.canPlay ? `Spin · ${ctx.fmt(ctx.stake)}` : "Log in to play"}
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- PLINKO */
function PlinkoGame(ctx: Ctx) {
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState("medium");
  const table = PLINKO_TABLE[risk][rows];
  const [ballStep, setBallStep] = useState(-1);
  const path = (ctx.result?.detail.path as number[]) ?? [];
  const bucket = ctx.result ? Number(ctx.result.detail.bucket ?? 0) : null;

  useEffect(() => {
    if (!ctx.result || !path.length) return;
    setBallStep(0);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setBallStep(i);
      if (i >= path.length) clearInterval(t);
    }, 90);
    return () => clearInterval(t);
  }, [ctx.result]);

  const W = 360;
  const H = 300;
  const rowH = H / (rows + 2);
  const ballPos = useMemo(() => {
    if (ballStep < 0 || !path.length) return { x: W / 2, y: 10 };
    let x = W / 2;
    const y = 10 + ballStep * rowH;
    for (let i = 0; i < Math.min(ballStep, path.length); i += 1) x += path[i] ? rowH * 0.55 : -rowH * 0.55;
    return { x, y };
  }, [ballStep, path, rowH]);

  return (
    <div className="grid gap-3">
      <div className="flex gap-1.5">
        {[8, 12, 16].map((r) => (
          <button key={r} onClick={() => setRows(r)} className={`flex-1 rounded-xl border py-2 text-xs font-black ${rows === r ? "border-brand-gold bg-brand-gold/15 text-white" : "border-[#243352] bg-[#0b1322] text-mist"}`}>
            {r} rows
          </button>
        ))}
        {["low", "medium", "high"].map((r) => (
          <button key={r} onClick={() => setRisk(r)} className={`flex-1 rounded-xl border py-2 text-xs font-black capitalize ${risk === r ? "border-brand-blue-bright bg-brand-blue/20 text-white" : "border-[#243352] bg-[#0b1322] text-mist"}`}>
            {r}
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-[#1e2b47] bg-[#070c16]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {Array.from({ length: rows }).map((_, r) =>
            Array.from({ length: r + 3 }).map((__, c) => {
              const y = 24 + r * rowH;
              const x = W / 2 + (c - (r + 2) / 2) * rowH * 1.1;
              return <circle key={`${r}-${c}`} cx={x} cy={y} r={2.4} fill="#2c3d5e" />;
            }),
          )}
          {ballStep >= 0 ? <circle cx={ballPos.x} cy={ballPos.y} r={7} fill="#f5b301" className="animate-ball" /> : null}
        </svg>
        <div className="flex justify-center gap-[2px] px-1 pb-1.5">
          {table.map((m, i) => (
            <span
              key={i}
              className={`tabular flex-1 rounded px-0.5 py-1 text-center text-[9px] font-black transition ${
                bucket === i ? "scale-110 bg-brand-gold text-black" : m >= 10 ? "bg-rose-600/70 text-white" : m >= 2 ? "bg-amber-500/60 text-black" : "bg-[#16233c] text-mist"
              }`}
              style={{ fontSize: rows > 12 ? "7px" : "9px" }}
            >
              {m}x
            </span>
          ))}
        </div>
      </div>
      <ResultBanner ctx={ctx} />
      <button onClick={() => void ctx.play({ rows, risk })} disabled={ctx.busy} className="btn btn-green h-13 w-full py-3.5 text-sm uppercase">
        {ctx.busy ? "Dropping…" : ctx.canPlay ? `Drop ball · ${ctx.fmt(ctx.stake)}` : "Log in to play"}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- ROULETTE */
type RBet = { type: string; value?: number; label: string; payout: number };
function RouletteGame(ctx: Ctx) {
  const [bet, setBet] = useState<RBet>({ type: "red", label: "Red", payout: 2 });
  const [spin, setSpin] = useState(0);
  const winning = ctx.result ? Number(ctx.result.detail.winning ?? 0) : null;

  useEffect(() => {
    if (winning === null) return;
    setSpin((s) => s + 1800 + winning * 9.73);
  }, [winning, ctx.result]);

  const options: RBet[] = [
    { type: "red", label: "Red", payout: 2 }, { type: "black", label: "Black", payout: 2 },
    { type: "odd", label: "Odd", payout: 2 }, { type: "even", label: "Even", payout: 2 },
    { type: "low", label: "1-18", payout: 2 }, { type: "high", label: "19-36", payout: 2 },
    { type: "dozen", value: 1, label: "1st 12", payout: 3 }, { type: "dozen", value: 2, label: "2nd 12", payout: 3 }, { type: "dozen", value: 3, label: "3rd 12", payout: 3 },
    { type: "column", value: 1, label: "Col 1", payout: 3 }, { type: "column", value: 2, label: "Col 2", payout: 3 }, { type: "column", value: 3, label: "Col 3", payout: 3 },
  ];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#1e2b47] bg-[#070c16] p-4">
        <div className="relative grid h-36 w-36 shrink-0 place-items-center">
          <div
            className="h-36 w-36 rounded-full border-4 border-[#243352]"
            style={{
              background: "repeating-conic-gradient(#c0002e 0deg 9.73deg, #101828 9.73deg 19.46deg)",
              transform: `rotate(${spin}deg)`,
              transition: "transform 3.4s cubic-bezier(0.12, 0.85, 0.18, 1)",
            }}
          />
          <div className="absolute grid h-20 w-20 place-items-center rounded-full bg-[#0b1322] ring-2 ring-[#243352]">
            <span className="tabular text-2xl font-black text-white">{winning ?? "–"}</span>
            <span className="text-[9px] font-bold text-mist">{ctx.result ? String(ctx.result.detail.colour ?? "").toUpperCase() : "EUROPEAN"}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="label mb-1.5">Outside bets</p>
          <div className="flex flex-wrap gap-1">
            {options.map((o) => (
              <button
                key={`${o.type}-${o.value ?? ""}`}
                onClick={() => setBet(o)}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-black ${
                  bet.type === o.type && bet.value === o.value
                    ? o.type === "red" ? "border-rose-400 bg-rose-600/30 text-white" : o.type === "black" ? "border-slate-300 bg-slate-800 text-white" : "border-brand-gold bg-brand-gold/20 text-white"
                    : "border-[#243352] bg-[#0b1322] text-mist hover:text-white"
                }`}
              >
                {o.label} <span className="text-brand-gold">{o.payout}x</span>
              </button>
            ))}
          </div>
          <p className="label mt-3 mb-1.5">Straight up (36x)</p>
          <div className="grid max-h-28 grid-cols-9 gap-1 overflow-y-auto scroll-thin sm:grid-cols-13">
            {[0, ...Array.from({ length: 36 }, (_, i) => i + 1)].map((n) => (
              <button
                key={n}
                onClick={() => setBet({ type: "straight", value: n, label: `Number ${n}`, payout: 36 })}
                className={`tabular rounded py-1 text-[10px] font-black ${
                  bet.type === "straight" && bet.value === n ? "ring-2 ring-brand-gold" : ""
                } ${n === 0 ? "bg-emerald-700 text-white" : RED_NUMBERS.has(n) ? "bg-[#c0002e] text-white" : "bg-[#16233c] text-slate-200"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-mist">
        Betting <span className="font-black text-white">{bet.label}</span> · pays{" "}
        <span className="tabular font-black text-brand-gold">{bet.payout}x</span> = {ctx.fmt(ctx.stake * bet.payout)}
      </p>
      <ResultBanner ctx={ctx} />
      <button onClick={() => void ctx.play({ betType: bet.type, value: bet.value })} disabled={ctx.busy} className="btn btn-green h-13 w-full py-3.5 text-sm uppercase">
        {ctx.busy ? "Spinning…" : ctx.canPlay ? `Spin roulette · ${ctx.fmt(ctx.stake)}` : "Log in to play"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ SLOTS */
function SlotsGame(ctx: Ctx) {
  const [reels, setReels] = useState<string[][]>(() => Array.from({ length: 5 }, () => ["🍒", "🍋", "🔔"]));
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const spin = async () => {
    const res = await ctx.play({});
    if (!res) return;
    setSpinning(true);
    timer.current = setInterval(() => {
      setReels(Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)])));
    }, 70);
    setTimeout(() => {
      if (timer.current) clearInterval(timer.current);
      setSpinning(false);
      const grid = (res.detail.grid as string[][]) ?? reels;
      setReels(grid);
    }, 1100);
  };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const winLines = new Set(((ctx.result?.detail.wins as { line: number }[]) ?? []).map((w) => w.line));

  return (
    <div className="grid gap-3">
      <div className="rounded-2xl border-2 border-brand-gold/40 bg-gradient-to-b from-[#2a1a05] to-[#0b1322] p-3 shadow-[0_0_40px_rgba(245,179,1,0.18)]">
        <div className="grid grid-cols-5 gap-1.5">
          {reels.map((col, i) => (
            <div key={i} className={`grid gap-1.5 rounded-xl border bg-[#070c16] p-1.5 ${spinning ? "shimmer" : winLines.size ? "border-brand-gold/50" : "border-[#1e2b47]"}`}>
              {col.map((sym, r) => (
                <div key={r} className={`grid h-14 place-items-center rounded-lg text-3xl transition ${spinning ? "blur-[1px]" : "animate-pop"}`}>{sym}</div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-bold text-mist">
          <span>5 reels · 5 paylines</span>
          <span className="text-brand-gold">
            {ctx.result?.win ? `${(ctx.result.detail.wins as unknown[]).length} winning line(s)` : "Good luck!"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 rounded-xl border border-[#1e2b47] bg-[#070c16] p-2">
        {[["🍒", "8x"], ["🍋", "12x"], ["🔔", "20x"], ["💎", "32x"], ["7️⃣", "60x"], ["👑", "120x"], ["✈️", "250x"]].map(([s, p]) => (
          <div key={s} className="text-center">
            <p className="text-xl">{s}</p>
            <p className="tabular text-[10px] font-black text-brand-gold">{p}</p>
          </div>
        ))}
      </div>
      <ResultBanner ctx={ctx} />
      <button onClick={() => void spin()} disabled={ctx.busy || spinning} className="btn btn-green h-13 w-full py-3.5 text-sm uppercase">
        {spinning || ctx.busy ? "Spinning…" : ctx.canPlay ? `Spin · ${ctx.fmt(ctx.stake)}` : "Log in to play"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ LIMBO */
function LimboGame(ctx: Ctx) {
  const [target, setTarget] = useState(2);
  const chance = Math.min(99, ((1 - 0.03) / target) * 100);
  const result = ctx.result ? Number(ctx.result.detail.result ?? 0) : null;
  return (
    <div className="grid gap-3">
      <div className="grid h-40 place-items-center rounded-2xl border border-[#1e2b47] bg-[#070c16]">
        <p className={`tabular font-display text-6xl font-black ${result === null ? "text-slate-700" : ctx.result?.win ? "text-emerald-400" : "text-rose-500"}`}>
          {result === null ? "1.00" : result.toFixed(2)}
          <span className="text-2xl">x</span>
        </p>
      </div>
      <div>
        <p className="label mb-1">Target multiplier</p>
        <input type="number" min={1.01} max={10000} step={0.01} value={target} onChange={(e) => setTarget(Math.max(1.01, Number(e.target.value)))} className="input tabular text-lg font-black" />
        <div className="mt-1.5 flex gap-1">
          {[1.5, 2, 5, 10, 50, 100].map((t) => (
            <button key={t} onClick={() => setTarget(t)} className="flex-1 rounded-lg border border-[#243352] bg-[#0b1322] py-1.5 text-[11px] font-bold text-mist hover:text-white">{t}x</button>
          ))}
        </div>
      </div>
      <div className="flex justify-between rounded-xl border border-[#1e2b47] bg-[#070c16] px-3 py-2 text-[11px] font-bold">
        <span className="text-mist">Win chance <span className="text-white">{chance.toFixed(2)}%</span></span>
        <span className="text-mist">Payout <span className="tabular text-brand-gold">{target.toFixed(2)}x = {ctx.fmt(ctx.stake * target)}</span></span>
      </div>
      <ResultBanner ctx={ctx} />
      <button onClick={() => void ctx.play({ target })} disabled={ctx.busy} className="btn btn-green h-13 w-full py-3.5 text-sm uppercase">
        {ctx.busy ? "Rolling…" : ctx.canPlay ? `Bet · ${ctx.fmt(ctx.stake)}` : "Log in to play"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------- HILO */
function HiLoGame(ctx: Ctx) {
  const d = ctx.result?.detail as { card1?: { rank: string; suit: string }; card2?: { rank: string; suit: string }; guess?: string } | undefined;
  const Card = ({ c, hidden }: { c?: { rank: string; suit: string }; hidden?: boolean }) => (
    <div className={`grid h-32 w-24 place-items-center rounded-xl border-2 text-center shadow-xl transition ${hidden ? "border-[#243352] bg-[linear-gradient(135deg,#16233c,#0b1322)]" : "border-brand-gold/60 bg-white"}`}>
      {hidden || !c ? (
        <span className="text-2xl text-mist">✦</span>
      ) : (
        <div>
          <p className={`font-display text-3xl font-black ${["♥", "♦"].includes(c.suit) ? "text-rose-600" : "text-slate-900"}`}>{c.rank}</p>
          <p className={`text-2xl ${["♥", "♦"].includes(c.suit) ? "text-rose-600" : "text-slate-900"}`}>{c.suit}</p>
        </div>
      )}
    </div>
  );
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-center gap-5 rounded-2xl felt border border-[#1e2b47] p-5">
        <Card c={d?.card1} hidden={!ctx.result && !d} />
        <span className="text-2xl text-mist">vs</span>
        <Card c={d?.card2} hidden={!ctx.result} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(["lower", "same", "higher"] as const).map((g) => (
          <button
            key={g}
            onClick={() => void ctx.play({ guess: g })}
            disabled={ctx.busy}
            className="btn btn-green h-12 text-xs uppercase"
          >
            {g} {g === "same" ? "13x" : g === "higher" ? "up to 13x" : "up to 13x"}
          </button>
        ))}
      </div>
      <ResultBanner ctx={ctx} />
      <p className="text-center text-[10px] text-mist">Cards are drawn with a cryptographic RNG. Ace is low, King is high.</p>
    </div>
  );
}

/* ------------------------------------------------------------------- KENO */
function KenoGame(ctx: Ctx) {
  const [picks, setPicks] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const drawn = (ctx.result?.detail.drawn as number[]) ?? [];
  const hits = new Set((ctx.result?.detail.hits as number[]) ?? []);
  const picked = new Set(picks);

  useEffect(() => {
    if (!ctx.result || !drawn.length) return;
    setRevealed([]);
    drawn.forEach((n, i) => setTimeout(() => setRevealed((r) => [...r, n]), i * 55));
  }, [ctx.result]);

  const toggle = (n: number) => {
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= 10 ? p : [...p, n]));
    ctx.setResult(null);
  };
  const revealedSet = new Set(revealed);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-mist">
          Pick up to 10 numbers · <span className="text-white">{picks.length}/10</span> selected
        </p>
        <div className="flex gap-1">
          <button onClick={() => setPicks(Array.from({ length: 10 }, (_, i) => Math.floor(Math.random() * 80) + 1))} className="rounded-lg border border-[#243352] bg-[#0b1322] px-2 py-1 text-[10px] font-bold text-mist">Quick pick</button>
          <button onClick={() => { setPicks([]); ctx.setResult(null); }} className="rounded-lg border border-[#243352] bg-[#0b1322] px-2 py-1 text-[10px] font-bold text-mist">Clear</button>
        </div>
      </div>
      <div className="grid grid-cols-10 gap-1 rounded-2xl border border-[#1e2b47] bg-[#070c16] p-2">
        {Array.from({ length: 80 }, (_, i) => i + 1).map((n) => {
          const isHit = hits.has(n);
          const isDrawn = revealedSet.has(n);
          const isPicked = picked.has(n);
          return (
            <button
              key={n}
              onClick={() => toggle(n)}
              className={`tabular grid h-8 place-items-center rounded text-[11px] font-black transition ${
                isHit ? "animate-pop bg-brand-gold text-black" : isDrawn ? "bg-brand-blue text-white" : isPicked ? "bg-emerald-600 text-white" : "bg-[#101c31] text-mist hover:bg-[#16233c]"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl border border-[#1e2b47] bg-[#070c16] p-2">
        {(ctx.result?.detail.paytable as number[] | undefined)?.map((m, i) => (
          <span key={i} className={`tabular rounded px-1.5 py-0.5 text-[10px] font-bold ${hits.size === i ? "bg-brand-gold text-black" : "bg-[#101c31] text-mist"}`}>
            {i}/{picks.length || 0} → {m}x
          </span>
        ))}
      </div>
      <ResultBanner ctx={ctx} />
      <button onClick={() => void ctx.play({ picks })} disabled={ctx.busy || picks.length === 0} className="btn btn-green h-13 w-full py-3.5 text-sm uppercase">
        {ctx.busy ? "Drawing…" : picks.length === 0 ? "Pick your numbers" : ctx.canPlay ? `Draw · ${ctx.fmt(ctx.stake)}` : "Log in to play"}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- BLACKJACK */
type BjState = { state: string; player?: any[]; dealer?: any[]; playerTotal?: number; result?: string; payout?: number; stake?: number; currency?: string };
function BlackjackGame(ctx: Ctx) {
  const [hand, setHand] = useState<BjState | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  const call = async (action: "deal" | "hit" | "stand" | "double") => {
    if (!ctx.canPlay && action === "deal") {
      ctx.login();
      return;
    }
    setBusy(true);
    const res = await api<BjState & { error?: string; balance?: number }>("/api/casino/blackjack", {
      method: "POST",
      json: { action, stake: ctx.stake },
    });
    setBusy(false);
    if (!res.ok) {
      push(errorMessage(res.data, "Action failed."), "error");
      return;
    }
    setHand(res.data);
    if (res.data.state === "done") {
      push(
        res.data.result === "push" ? "Push — stake returned." : (res.data.payout ?? 0) > 0 ? `You win ${ctx.fmt(res.data.payout ?? 0)}!` : "Dealer wins.",
        (res.data.payout ?? 0) > (res.data.stake ?? 0) ? "success" : "info",
      );
    }
  };

  const total = (cards?: any[]) => (cards ?? []).reduce((s, c) => s + c.value, 0);
  const pTotal = hand?.state === "playing" ? total(hand.player) : hand?.playerTotal ?? total(hand?.player);
  const playing = hand?.state === "playing";
  const CardView = ({ c, hidden }: { c?: any; hidden?: boolean }) => (
    <div className={`animate-pop grid h-24 w-16 place-items-center rounded-lg border-2 text-center shadow-lg sm:h-28 sm:w-20 ${hidden ? "border-[#243352] bg-[repeating-linear-gradient(45deg,#16233c,#16233c_6px,#0b1322_6px,#0b1322_12px)]" : "border-brand-gold/50 bg-white"}`}>
      {hidden || !c ? (
        <span className="text-mist">✦</span>
      ) : (
        <div>
          <p className={`font-display text-xl font-black ${["♥", "♦"].includes(c.suit) ? "text-rose-600" : "text-slate-900"}`}>{c.rank}</p>
          <p className={`text-lg ${["♥", "♦"].includes(c.suit) ? "text-rose-600" : "text-slate-900"}`}>{c.suit}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3">
      <div className="felt relative overflow-hidden rounded-2xl border border-[#1e2b47] p-4">
        <p className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[0.3em] text-emerald-200/50">
          Blackjack pays 3 to 2 · Dealer must draw to 16, stand on 17
        </p>
        <div className="mt-5">
          <p className="label mb-1.5">Dealer {hand ? `· ${hand.state === "done" ? total(hand.dealer) : "?"}` : ""}</p>
          <div className="flex gap-1.5">
            {hand?.dealer?.length ? (
              hand.dealer.map((c, i) => <CardView key={i} c={c} hidden={hand.state === "playing" && i === 1} />)
            ) : (
              <p className="text-xs text-emerald-200/50">Deal a hand to start</p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <p className="label mb-1.5">You · <span className="tabular text-base font-black text-white">{pTotal || 0}</span></p>
          <div className="flex gap-1.5">
            {hand?.player?.map((c, i) => <CardView key={i} c={c} />)}
          </div>
        </div>
        {hand?.state === "done" ? (
          <div className={`animate-pop mt-4 rounded-xl border px-3 py-2 text-center ${hand.result === "lose" || hand.result === "bust" ? "border-rose-500/50 bg-rose-950/50" : hand.result === "push" ? "border-sky-500/50 bg-sky-950/40" : "border-emerald-500/50 bg-emerald-950/50"}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-mist">{hand.result}</p>
            <p className="tabular text-xl font-black text-white">{ctx.fmt(hand.payout ?? 0)}</p>
          </div>
        ) : null}
      </div>

      {!playing ? (
        <button onClick={() => void call("deal")} disabled={busy} className="btn btn-green h-13 w-full py-3.5 text-sm uppercase">
          {busy ? "Dealing…" : ctx.canPlay ? `Deal · ${ctx.fmt(ctx.stake)}` : "Log in to play"}
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => void call("hit")} disabled={busy} className="btn btn-blue h-12 text-xs uppercase">Hit</button>
          <button onClick={() => void call("stand")} disabled={busy} className="btn btn-red h-12 text-xs uppercase">Stand</button>
          <button onClick={() => void call("double")} disabled={busy || ctx.balance < ctx.stake * 2} className="btn btn-ghost h-12 text-xs uppercase">Double</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- page */
function GameInner() {
  const { game } = useParams<{ game: string }>();
  const id = String(game ?? "dice");
  if (!GAMES[id]) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-8 text-center">
        <div>
          <p className="text-4xl">🎰</p>
          <p className="mt-2 font-display text-lg font-black text-white">Game not found</p>
          <Link href="/casino" className="btn btn-blue mt-3 h-10 px-4 text-xs uppercase">Back to the casino</Link>
        </div>
      </div>
    );
  }
  return (
    <Shell id={id}>
      {(ctx) => {
        switch (id) {
          case "mines": return <MinesGame {...ctx} />;
          case "wheel": return <WheelGame {...ctx} />;
          case "plinko": return <PlinkoGame {...ctx} />;
          case "roulette": return <RouletteGame {...ctx} />;
          case "slots": return <SlotsGame {...ctx} />;
          case "limbo": return <LimboGame {...ctx} />;
          case "hilo": return <HiLoGame {...ctx} />;
          case "keno": return <KenoGame {...ctx} />;
          case "blackjack": return <BlackjackGame {...ctx} />;
          default: return <DiceGame {...ctx} />;
        }
      }}
    </Shell>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-mist">Loading game…</div>}>
      <GameInner />
    </Suspense>
  );
}
