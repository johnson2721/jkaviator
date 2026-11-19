"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MatchRow, { type PublicEvent } from "@/components/betting/MatchRow";
import SlipPanel from "@/components/betting/SlipPanel";
import { api } from "@/lib/api";
import { useApp, useAuth } from "@/components/providers/AppProviders";
import { sportIcon } from "@/lib/data/sports";

type SportsResponse = {
  sports: { key: string; name: string; icon: string; count: number }[];
  counts: { live: number; upcoming: number };
  events: PublicEvent[];
  leagues: { sport: string; league: string; country: string | null }[];
};

function PromoCarousel() {
  const { settings, currencies } = useApp();
  const { user } = useAuth();
  const [i, setI] = useState(0);
  const slides = [
    {
      kicker: "Welcome offer",
      title: `${settings.welcomeBonus} KES when you join`,
      body: "Register with your phone number, confirm the SMS code and your bonus request goes straight to the payments desk.",
      cta: user ? "Deposit now" : "Register",
      href: user ? "/wallet" : "/register",
      bg: "linear-gradient(115deg,#0b57c4 0%,#083f92 55%,#04224f 100%)",
      emoji: "🎁",
    },
    {
      kicker: "Live now",
      title: "In-play betting on every match",
      body: "Scores, minutes and prices update automatically. Double chance, totals, handicaps, correct score and half markets — all live.",
      cta: "Open Multi-LIVE",
      href: "/live",
      bg: "linear-gradient(115deg,#c8102e 0%,#8c0b20 60%,#3d0510 100%)",
      emoji: "🔴",
    },
    {
      kicker: "Casino & games",
      title: "12 games · one wallet · instant payouts",
      body: "Aviator, Plinko, Roulette, Blackjack, Lucky Reels, Mines, Keno, Limbo, Hi-Lo, Dice and Wheel — all provably fair.",
      cta: "Play now",
      href: "/casino",
      bg: "linear-gradient(115deg,#0f766e 0%,#115e59 55%,#052e2b 100%)",
      emoji: "🎰",
    },
    {
      kicker: "Multi-currency",
      title: `${currencies.length || 15} currency accounts in one login`,
      body: "KES, UGX, TZS, NGN, USD, EUR, GBP, USDT, BTC and more. Switch accounts from the header and bet in any of them.",
      cta: "Manage wallets",
      href: "/wallet",
      bg: "linear-gradient(115deg,#b45309 0%,#92400e 55%,#3f2305 100%)",
      emoji: "💱",
    },
  ];
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % slides.length), 5500);
    return () => clearInterval(t);
  }, [slides.length]);
  const s = slides[i];
  return (
    <div className="mb-3 overflow-hidden rounded-lg shadow-[0_6px_24px_rgba(8,63,146,0.22)]">
      <div className="relative flex min-h-[150px] flex-wrap items-center gap-4 p-5 sm:min-h-[172px]" style={{ background: s.bg }}>
        <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: "radial-gradient(circle at 85% 10%, rgba(255,255,255,0.4), transparent 45%)" }} />
        <div className="relative min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/70">{s.kicker}</p>
          <h2 className="font-display mt-1 text-xl font-black leading-tight text-white sm:text-3xl">{s.title}</h2>
          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-white/80 sm:text-sm">{s.body}</p>
          <Link href={s.href} className="x-btn x-btn-gold mt-3 h-9 px-4 text-[11px] uppercase">{s.cta}</Link>
        </div>
        <div className="relative hidden text-6xl drop-shadow-lg sm:block">{s.emoji}</div>
        <div className="relative flex w-full gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              className="h-1.5 rounded-full transition-all"
              style={{ width: idx === i ? 26 : 8, background: idx === i ? "#ffd25e" : "rgba(255,255,255,0.35)" }}
              aria-label={`slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { settings, sports } = useApp();
  const [data, setData] = useState<SportsResponse | null>(null);
  const [sport, setSport] = useState("all");

  const load = useCallback(async () => {
    const res = await api<SportsResponse>(`/api/sports?limit=160${sport === "all" ? "" : `&sport=${sport}`}`);
    if (res.ok) setData(res.data);
  }, [sport]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const events = data?.events ?? [];
  const live = events.filter((e) => e.status === "live");
  const upcoming = events.filter((e) => e.status === "scheduled");
  const featured = (events.filter((e) => e.featured).length ? events.filter((e) => e.featured) : upcoming).slice(0, 10);
  const byLeague = upcoming.reduce<Record<string, PublicEvent[]>>((acc, e) => {
    acc[e.league] = acc[e.league] ?? [];
    acc[e.league].push(e);
    return acc;
  }, {});
  const sportsList: { key: string; name: string; count?: number }[] = data?.sports ?? (sports ?? []).map((s) => ({ key: s.key, name: s.name }));

  return (
    <div className="x-page">
      <div className="mx-auto max-w-[1700px] px-2 py-3 sm:px-4">
        <PromoCarousel />

        <div className="grid gap-3 lg:grid-cols-[196px_minmax(0,1fr)_340px]">
          {/* left rail */}
          <aside className="grid gap-3 lg:sticky lg:top-[116px] lg:h-fit">
            <div className="x-card overflow-hidden">
              <div className="x-head">
                <span className="x-title">Sports</span>
                <span className="x-sec ml-auto">{(data?.counts.live ?? 0) + (data?.counts.upcoming ?? 0)}</span>
              </div>
              <div className="flex gap-1 overflow-x-auto p-1.5 lg:flex-col lg:overflow-visible x-scroll">
                <button
                  onClick={() => setSport("all")}
                  className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-[12px] font-bold lg:w-full"
                  style={sport === "all" ? { background: "#eaf3ff", color: "var(--x-blue)" } : { color: "#33415c" }}
                >
                  <span>🏆</span> Top matches
                </button>
                {sportsList.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSport(s.key)}
                    className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-[12px] font-bold lg:w-full"
                    style={sport === s.key ? { background: "#eaf3ff", color: "var(--x-blue)" } : { color: "#33415c" }}
                  >
                    <span>{sportIcon(s.key)}</span> {s.name}
                    <span className="ml-auto hidden text-[10px] font-black x-muted lg:inline">{s.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="x-card hidden overflow-hidden lg:block">
              <div className="x-head"><span className="x-title">Top championships</span></div>
              <div className="p-1.5">
                {(data?.leagues ?? []).slice(0, 10).map((l) => (
                  <Link
                    key={`${l.sport}-${l.league}`}
                    href={`/sport/${l.sport}`}
                    className="block truncate rounded-md px-2.5 py-1.5 text-[11px] font-bold hover:bg-[#eef2f8]"
                    style={{ color: "#33415c" }}
                  >
                    <span className="mr-1">{sportIcon(l.sport)}</span>
                    {l.league}
                  </Link>
                ))}
              </div>
            </div>

            <div className="x-card hidden overflow-hidden lg:block">
              <div className="x-head"><span className="x-title">Games</span></div>
              <div className="p-1.5">
                {[["✈️", "Aviator", "/casino/aviator"], ["🔻", "Plinko", "/casino/plinko"], ["🎰", "Roulette", "/casino/roulette"], ["🂡", "Blackjack", "/casino/blackjack"], ["🎰", "Lucky Reels", "/casino/slots"]].map(([e, n, h]) => (
                  <Link key={n} href={h} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-bold hover:bg-[#eef2f8]" style={{ color: "#33415c" }}>
                    <span>{e}</span> {n}
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          {/* centre */}
          <div className="grid min-w-0 gap-3">
            {live.length ? (
              <section className="x-card overflow-hidden">
                <div className="x-head">
                  <span className="x-live x-pulse text-sm">●</span>
                  <span className="x-title">Live now</span>
                  <span className="x-sec">{live.length} in play</span>
                  <Link href="/live" className="x-sec ml-auto hover:text-[#0b57c4]">Multi-LIVE →</Link>
                </div>
                {live.slice(0, 8).map((e) => (
                  <MatchRow key={e.id} event={e} showLeague />
                ))}
              </section>
            ) : null}

            <section className="x-card overflow-hidden">
              <div className="x-head">
                <span className="x-title">⭐ Top matches</span>
                <span className="x-sec ml-auto">1X2 · O/U 2.5 · Double chance</span>
              </div>
              {featured.map((e) => (
                <MatchRow key={e.id} event={e} showLeague />
              ))}
            </section>

            {Object.entries(byLeague).slice(0, 10).map(([league, list]) => (
              <section key={league} className="x-card overflow-hidden">
                <div className="x-head">
                  <span className="x-title">{league}</span>
                  <span className="x-sec">{list[0]?.country}</span>
                  <span className="x-sec ml-auto">{list.length} matches</span>
                </div>
                {list.slice(0, 10).map((e) => (
                  <MatchRow key={e.id} event={e} />
                ))}
              </section>
            ))}

            {!data ? (
              <div className="x-card grid place-items-center p-12">
                <div className="h-9 w-9 animate-spin rounded-full border-2" style={{ borderColor: "#0b57c4", borderTopColor: "transparent" }} />
                <p className="mt-3 text-xs font-bold x-muted">Loading {settings.siteName} odds…</p>
              </div>
            ) : null}
          </div>

          {/* right rail */}
          <div className="hidden lg:block">
            <SlipPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
