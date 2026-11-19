"use client";

import { useEffect, useRef, useState } from "react";
import { api, multiplierColor } from "@/lib/api";
import { money } from "@/lib/currency";
import type { PublicUser } from "@/lib/api";
import BetPanel from "./BetPanel";
import FlightCanvas from "./FlightCanvas";
import LiveBets from "./LiveBets";
import { liveMultiplier, secondsUntil, useGameStream } from "./useGameStream";

type Props = {
  user: PublicUser;
  refreshUser: () => Promise<void>;
  toast: (text: string, kind?: "success" | "error" | "info") => void;
};

type TopWin = { name: string; amount: number; multiplier: number; payout: number };

export default function AviatorGame({ user, refreshUser, toast }: Props) {
  const kes = (v: number | string, _d = 0) => money(Number(v), user?.currency || "KES");
  const { ref: gameRef, snapshot } = useGameStream();
  const bigRef = useRef<HTMLDivElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [shake, setShake] = useState(false);
  const [topWins, setTopWins] = useState<TopWin[]>([]);
  const lastPhase = useRef(snapshot.phase);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await api<{ topWins?: TopWin[] }>("/api/game/history");
      if (alive && res.ok) setTopWins(res.data.topWins ?? []);
    };
    void load();
    const t = setInterval(load, 25000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const r = gameRef.current;
      if (r) {
        if (r.phase === "flying") {
          const m = liveMultiplier(r);
          if (bigRef.current) bigRef.current.textContent = `${m.toFixed(2)}x`;
          if (subRef.current) subRef.current.textContent = "IN FLIGHT";
        } else if (r.phase === "crashed") {
          const cp = r.crashPoint ?? r.multiplier ?? 1;
          if (bigRef.current) bigRef.current.textContent = `${cp.toFixed(2)}x`;
          if (subRef.current) subRef.current.textContent = "FLEW AWAY!";
        } else {
          const s = secondsUntil(r);
          if (bigRef.current) bigRef.current.textContent = s.toFixed(1);
          if (subRef.current) subRef.current.textContent = "NEXT ROUND IN";
          if (countRef.current) countRef.current.textContent = `${Math.max(0, Math.ceil(s))}s`;
          if (barRef.current) barRef.current.style.width = `${Math.max(0, Math.min(100, (1 - s / 9) * 100))}%`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [gameRef]);

  useEffect(() => {
    if (lastPhase.current !== "crashed" && snapshot.phase === "crashed") setShake(true);
    if (snapshot.phase !== "crashed" && shake) setShake(false);
    lastPhase.current = snapshot.phase;
  }, [snapshot.phase, shake]);

  const phaseColor =
    snapshot.phase === "crashed" ? "text-rose-500" : snapshot.phase === "flying" ? "text-white" : "text-brand-gold";

  return (
    <div className="mx-auto grid max-w-[1500px] gap-3 px-3 py-3 sm:px-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="grid gap-3">
        {/* history strip */}
        <div className="panel-flat flex items-center gap-2 overflow-hidden px-3 py-2">
          <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-mist">Recent</span>
          <div className="scroll-thin flex flex-1 gap-1.5 overflow-x-auto hide-scroll">
            {snapshot.history.length === 0 ? (
              <span className="text-xs text-mist">Loading rounds…</span>
            ) : (
              snapshot.history.map((h, i) => (
                <span key={`${h}-${i}`} className={`chip border tabular ${multiplierColor(h)}`}>
                  {h.toFixed(2)}x
                </span>
              ))
            )}
          </div>
        </div>

        {/* flight screen */}
        <div className={`panel relative overflow-hidden ${shake ? "animate-crash" : ""}`}>
          <div className="relative h-[330px] sm:h-[420px] lg:h-[500px]">
            <FlightCanvas gameRef={gameRef} />

            {/* top badges */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white/80 backdrop-blur">
                  Round #{snapshot.roundId}
                </span>
                <span className="hidden items-center gap-1 rounded-lg border border-emerald-500/25 bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300 backdrop-blur sm:flex">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                    <path d="M12 2l7 3v6c0 4.5-3 8.5-7 11-4-2.5-7-6.5-7-11V5z" />
                  </svg>
                  Provably fair
                </span>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-1 text-right text-[10px] font-black uppercase tracking-widest text-white/80 backdrop-blur">
                <span className="block text-brand-gold">{kes(snapshot.totalStaked, 0)}</span>
                <span className="text-[9px] text-white/60">staked this round</span>
              </div>
            </div>

            {/* centre readout */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {snapshot.phase === "waiting" ? (
                <div className="w-[min(78%,340px)] text-center">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-white/70">
                    Place your bets
                  </p>
                  <div ref={bigRef} className="tabular mt-1 text-6xl font-black text-brand-gold drop-shadow">
                    9.0
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div ref={barRef} className="h-full rounded-full bg-brand-red transition-[width] duration-100" style={{ width: "0%" }} />
                  </div>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-white/50">
                    Take-off in <span ref={countRef}>9s</span>
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p
                    ref={subRef}
                    className={`text-xs font-black uppercase tracking-[0.35em] ${
                      snapshot.phase === "crashed" ? "text-rose-400" : "text-white/70"
                    }`}
                  >
                    IN FLIGHT
                  </p>
                  <div
                    ref={bigRef}
                    className={`tabular font-display mt-1 text-[clamp(3.2rem,12vw,7rem)] font-black leading-none drop-shadow-[0_0_28px_rgba(229,5,57,0.45)] ${phaseColor}`}
                  >
                    1.00x
                  </div>
                  {snapshot.phase === "crashed" ? (
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-white/45">
                      Next round in 3 seconds
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* winners ticker */}
          <div className="relative flex h-9 items-center overflow-hidden border-t border-[#1e2739] bg-[#0b1020]">
            <span className="z-10 shrink-0 bg-brand-gold px-2 py-1 text-[9px] font-black uppercase tracking-widest text-black">
              Top wins
            </span>
            <div className="relative flex-1 overflow-hidden">
              <div className="animate-ticker flex w-max gap-6 pl-4">
                {[...topWins, ...topWins].map((w, i) => (
                  <span key={i} className="shrink-0 text-[11px] font-bold text-mist">
                    <span className="text-white">{w.name}</span> won{" "}
                    <span className="text-emerald-400">{money(w.payout, "KES")}</span> @{" "}
                    <span className="text-brand-red-soft">{w.multiplier.toFixed(2)}x</span>
                  </span>
                ))}
                {topWins.length === 0 ? <span className="text-[11px] text-mist">Be the first big winner…</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <BetPanel user={user} refreshUser={refreshUser} gameRef={gameRef} snapshot={snapshot} toast={toast} />
          <div className="grid gap-3">
            <div className="panel-flat p-3">
              <p className="label mb-2">How auto cash-out works</p>
              <ul className="grid gap-1.5 text-xs leading-relaxed text-slate-300">
                <li className="flex gap-2">
                  <span className="text-emerald-400">▸</span> Set your multiplier in the AUTO tab, then press BET.
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">▸</span> The server settles your bet the millisecond the plane
                  passes your target — even if your connection drops.
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">▸</span> Winnings land in your wallet instantly and appear under
                  Wallet → Transactions.
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-gold">▸</span> Bonus and withdrawal requests are approved by the
                  operator in the console.
                </li>
              </ul>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="panel-flat p-3 text-center">
                <p className="tabular text-lg font-black text-white">{user.betsCount}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-mist">Bets</p>
              </div>
              <div className="panel-flat p-3 text-center">
                <p className="tabular text-lg font-black text-brand-gold">{money(user.totalWon, user.currency)}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-mist">Won</p>
              </div>
              <div className="panel-flat p-3 text-center">
                <p className="tabular text-lg font-black text-rose-400">{money(user.totalStaked, user.currency)}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-mist">Staked</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LiveBets snapshot={snapshot} user={user} />
    </div>
  );
}
