"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/AppProviders";

const STEPS = [
  "Starting secure session…",
  "Connecting to live odds feed…",
  "Loading football markets…",
  "Syncing casino tables…",
  "Ready. Good luck!",
];

/** 1xBet-mobile style boot screen shown on every app open. */
export default function Splash() {
  const { settings } = useApp();
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const started = performance.now();
    const duration = 2100;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      // eased, slightly "mechanical" progress
      const eased = p < 0.75 ? p * 1.15 : 0.86 + (p - 0.75) * 0.56;
      setPct(Math.min(100, Math.round(eased * 100)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setHidden(true), 420);
    return () => clearTimeout(t);
  }, [done]);

  if (hidden) return null;
  const step = STEPS[Math.min(STEPS.length - 1, Math.floor((pct / 100) * STEPS.length))];

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#04060c] transition-opacity duration-400 ${
        done ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 50% 30%, rgba(229,5,57,0.22), transparent 55%), radial-gradient(circle at 80% 80%, rgba(43,127,255,0.16), transparent 50%)" }} />
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <svg viewBox="0 0 64 64" className="h-16 w-16 drop-shadow-[0_0_24px_rgba(229,5,57,0.55)]">
            <defs>
              <linearGradient id="splashPlane" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff5c78" />
                <stop offset="100%" stopColor="#b3002a" />
              </linearGradient>
            </defs>
            <path
              fill="url(#splashPlane)"
              d="M6 34c14-2 24-8 31-17l3-4 2 5c2 5 5 9 9 12l4 3-5 2c-6 2-11 6-14 11l-2 4-3-4c-4-6-9-10-16-12l-9-3z"
            />
          </svg>
          <span className="absolute -inset-6 animate-ping rounded-full border border-brand-red/25" />
        </div>
        <h1 className="font-display mt-4 text-3xl font-black tracking-tight text-white">
          {settings.siteName.toUpperCase()}
          <span className="text-brand-red">.</span>
        </h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.4em] text-mist">{settings.tagline}</p>

        <div className="mt-8 h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-red via-brand-gold to-emerald-400 transition-[width] duration-100"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex w-64 items-center justify-between text-[10px] font-bold uppercase tracking-widest">
          <span className="text-mist">{step}</span>
          <span className="tabular text-white">{pct}%</span>
        </div>
        <p className="mt-8 text-[10px] text-slate-600">18+ · Play responsibly · Licensed odds</p>
      </div>
    </div>
  );
}
