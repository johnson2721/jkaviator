"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api, kes } from "@/lib/api";
import { money } from "@/lib/currency";
import { useApp, useAuth } from "@/components/providers/AppProviders";

type Meta = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  tag: string;
  blurb: string;
  accent: string;
  badge?: string;
};
type Catalogue = { meta: Record<string, Meta>; categories: { key: string; label: string }[]; siteName: string; edge: number };
type Win = { name: string; amount: number; multiplier: number; payout: number };

function badgeClass(b?: string) {
  if (b === "HOT") return "badge-hot";
  if (b === "NEW") return "badge-new";
  if (b === "TOP") return "badge-top";
  return "bg-[#1b2436] text-mist";
}

function GameTile({ m, balance }: { m: Meta; balance: string }) {
  return (
    <Link
      href={m.id === "aviator" ? "/casino/aviator" : m.id === "crashx" ? "/casino/aviator" : `/casino/${m.id}`}
      className={`card-hover tile-glow group relative overflow-hidden rounded-2xl border border-[#1e2b47] bg-gradient-to-br ${m.accent} via-[#0d1526] to-[#080d18] p-4`}
    >
      {m.badge ? (
        <span className={`absolute top-3 right-3 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${badgeClass(m.badge)}`}>
          {m.badge}
        </span>
      ) : null}
      <div className="grid h-24 place-items-center rounded-xl bg-black/25 text-5xl transition group-hover:scale-110">
        {m.emoji}
      </div>
      <p className="mt-3 font-display text-base font-black text-white">{m.name}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-brand-blue-bright">{m.tag}</p>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-300">{m.blurb}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="btn btn-blue h-8 px-3 text-[11px] uppercase">Play</span>
        <span className="tabular text-[10px] font-bold text-mist">{balance}</span>
      </div>
    </Link>
  );
}

function LobbyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { settings, activeCurrency, activeWallet, currencies } = useApp();
  const { user } = useAuth();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [data, setData] = useState<Catalogue | null>(null);
  const [wins, setWins] = useState<Win[]>([]);

  useEffect(() => {
    api<Catalogue>("/api/casino/games").then((r) => r.ok && setData(r.data));
    api<{ topWins?: Win[] }>("/api/game/history").then((r) => r.ok && setWins(r.data.topWins ?? []));
  }, []);

  const meta = data?.meta ?? {};
  const list = useMemo(() => Object.values(meta), [meta]);
  const filtered = list
    .filter((m) => (cat === "all" ? true : m.category === cat))
    .filter((m) => (q ? `${m.name} ${m.tag} ${m.blurb}`.toLowerCase().includes(q.toLowerCase()) : true));

  const popular = filtered.filter((m) => m.badge === "HOT" || m.badge === "TOP");
  const fresh = filtered.filter((m) => m.badge === "NEW");
  const rest = filtered.filter((m) => !m.badge);
  const balance = money(activeWallet?.balance ?? user?.balance ?? 0, activeCurrency);
  const ccyMeta = currencies.find((c) => c.code === activeCurrency);

  return (
    <div className="mx-auto max-w-[1700px] px-2 py-3 sm:px-4">
      {/* hero */}
      <div className="panel tile-glow relative mb-3 overflow-hidden p-5 sm:p-7">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 12% 15%, rgba(61,139,253,0.42), transparent 45%), radial-gradient(circle at 82% 8%, rgba(245,179,1,0.3), transparent 42%), radial-gradient(circle at 60% 100%, rgba(229,5,57,0.3), transparent 55%)",
          }}
        />
        <div className="relative flex flex-wrap items-end gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-brand-blue-bright">
              {settings.siteName} casino
            </p>
            <h1 className="font-display mt-1 text-2xl font-black text-white sm:text-4xl">
              {list.length || 12} games · one wallet · instant payouts
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
              Crash, instant-win, card, table, slot and lottery games. Every round is decided by a cryptographic RNG on
              our servers with a {data?.edge ?? 3}% house edge, and winnings land in your{" "}
              <span className="font-black text-brand-gold">{activeCurrency}</span> account immediately.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/casino/aviator" className="btn btn-green h-10 px-4 text-xs uppercase">
                ✈️ Play Aviator
              </Link>
              <Link href="/casino/plinko" className="btn btn-blue h-10 px-4 text-xs uppercase">
                🔻 Plinko
              </Link>
              <Link href="/wallet" className="btn btn-ghost h-10 px-4 text-xs uppercase">
                Deposit
              </Link>
              {!user ? (
                <Link href="/register" className="btn h-10 bg-brand-gold px-4 text-xs uppercase text-black">
                  Claim {settings.welcomeBonus} KES bonus
                </Link>
              ) : null}
            </div>
          </div>
          <div className="ml-auto rounded-2xl border border-[#243352] bg-black/35 px-4 py-3 text-right backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-widest text-mist">Your balance</p>
            <p className="tabular text-2xl font-black text-brand-gold">{balance}</p>
            <p className="text-[11px] text-mist">
              {ccyMeta?.flag} {activeCurrency} account
            </p>
          </div>
        </div>

        {/* winners ticker */}
        <div className="relative mt-4 flex h-8 items-center overflow-hidden rounded-lg border border-[#243352] bg-black/35">
          <span className="z-10 shrink-0 bg-brand-gold px-2 py-1 text-[9px] font-black uppercase tracking-widest text-black">
            Latest wins
          </span>
          <div className="relative flex-1 overflow-hidden">
            <div className="animate-marquee flex w-max gap-6 pl-4">
              {[...wins, ...wins].map((w, i) => (
                <span key={i} className="shrink-0 text-[11px] font-bold text-mist">
                  <span className="text-white">{w.name}</span> won{" "}
                  <span className="text-emerald-400">{kes(w.payout, 0)}</span> @{" "}
                  <span className="text-brand-gold">{w.multiplier.toFixed(2)}x</span>
                </span>
              ))}
              {wins.length === 0 ? <span className="text-[11px] text-mist">Be the first winner on the ticker…</span> : null}
            </div>
          </div>
        </div>
      </div>

      {/* filters */}
      <div className="panel-flat sticky top-[104px] z-40 mb-3 flex flex-wrap items-center gap-2 p-2">
        <div className="flex gap-1 overflow-x-auto scroll-x">
          {(data?.categories ?? [{ key: "all", label: "All games" }]).map((c) => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition ${
                cat === c.key ? "bg-brand-blue text-white shadow-[0_4px_18px_rgba(31,111,224,0.4)]" : "bg-[#0f1a2e] text-mist hover:text-white"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              router.replace(e.target.value ? `/casino?q=${encodeURIComponent(e.target.value)}` : "/casino");
            }}
            placeholder="Search 12 games…"
            className="input h-9 py-1 pl-8 text-xs"
          />
          <svg viewBox="0 0 24 24" className="absolute top-2.5 left-2.5 h-4 w-4 text-mist" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {!data ? (
        <div className="panel-flat grid place-items-center p-16">
          <div className="h-10 w-10 animate-spin-slow rounded-full border-2 border-brand-blue-bright border-t-transparent" />
          <p className="mt-3 text-xs text-mist">Loading the casino floor…</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {popular.length ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-display text-base font-black text-white">🔥 Popular now</h2>
                <span className="neon-line flex-1" />
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {popular.map((m) => (
                  <GameTile key={m.id} m={m} balance={balance} />
                ))}
              </div>
            </section>
          ) : null}

          {fresh.length ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-display text-base font-black text-white">✨ New releases</h2>
                <span className="neon-line flex-1" />
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {fresh.map((m) => (
                  <GameTile key={m.id} m={m} balance={balance} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="font-display text-base font-black text-white">
                {cat === "all" ? "🎲 All games" : data.categories.find((c) => c.key === cat)?.label}
              </h2>
              <span className="text-[11px] text-mist">{filtered.length} titles</span>
              <span className="neon-line flex-1" />
            </div>
            {filtered.length === 0 ? (
              <p className="panel-flat p-10 text-center text-xs text-mist">No games match “{q}”.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {(rest.length ? rest : filtered).map((m) => (
                  <GameTile key={m.id} m={m} balance={balance} />
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            {[
              ["🔐", "Provably fair", "Outcomes are generated by a cryptographic RNG on the server — the browser never decides a result."],
              ["👛", "Single wallet", "One balance covers sports, Aviator, casino and instant games. Switch between 15 currency accounts instantly."],
              ["⚡", "Instant payouts", "Wins are credited the millisecond a round settles and withdrawals go straight to the payments desk."],
            ].map(([icon, title, body]) => (
              <div key={title} className="panel-flat p-4">
                <p className="text-2xl">{icon}</p>
                <p className="mt-1.5 font-display text-sm font-black text-white">{title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-mist">{body}</p>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

export default function CasinoPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-mist">Loading casino…</div>}>
      <LobbyInner />
    </Suspense>
  );
}
