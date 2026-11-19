"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import MatchRow, { type PublicEvent } from "@/components/betting/MatchRow";
import SlipPanel from "@/components/betting/SlipPanel";
import { api } from "@/lib/api";
import { sportIcon, sportLabel } from "@/lib/data/sports";

type Res = { events: PublicEvent[]; leagues: { sport: string; league: string; country: string | null }[] };

function SportInner() {
  const { key } = useParams<{ key: string }>();
  const [data, setData] = useState<Res | null>(null);
  const [league, setLeague] = useState("all");
  const [day, setDay] = useState<"all" | "today" | "tomorrow" | "live">("all");

  const load = useCallback(async () => {
    const res = await api<Res>(`/api/sports?sport=${key}&limit=160`);
    if (res.ok) setData(res.data);
  }, [key]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  const leagues = (data?.leagues ?? []).filter((l) => l.sport === key);
  let events = data?.events ?? [];
  if (league !== "all") events = events.filter((e) => e.league === league);
  const today = new Date().toDateString();
  const tomorrow = new Date(Date.now() + 86400000).toDateString();
  if (day === "today") events = events.filter((e) => new Date(e.kickoff).toDateString() === today || e.status === "live");
  if (day === "tomorrow") events = events.filter((e) => new Date(e.kickoff).toDateString() === tomorrow);
  if (day === "live") events = events.filter((e) => e.status === "live");

  const grouped = events.reduce<Record<string, PublicEvent[]>>((acc, e) => {
    acc[e.league] = acc[e.league] ?? [];
    acc[e.league].push(e);
    return acc;
  }, {});

  return (
    <div className="x-page">
      <div className="mx-auto max-w-[1700px] px-2 py-3 sm:px-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold x-muted">
          <Link href="/" className="hover:text-[#0b57c4]">Sports</Link>
          <span>›</span>
          <span style={{ color: "#33415c" }}>{sportLabel(key)}</span>
        </div>

        <div className="x-card mb-3 flex flex-wrap items-center gap-2 p-3">
          <span className="text-2xl">{sportIcon(key)}</span>
          <div>
            <h1 className="font-display text-lg font-black" style={{ color: "var(--x-ink)" }}>{sportLabel(key)}</h1>
            <p className="text-[11px] font-bold x-muted">
              {events.length} matches · {leagues.length} competitions · {(data?.events ?? []).filter((e) => e.status === "live").length} live
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-1">
            {(["all", "today", "tomorrow", "live"] as const).map((d) => (
              <button key={d} className="x-tab" data-on={day === d ? "1" : "0"} onClick={() => setDay(d)}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)_340px]">
          <aside className="grid gap-3 lg:sticky lg:top-[116px] lg:h-fit">
            <div className="x-card overflow-hidden">
              <div className="x-head"><span className="x-title">Competitions</span></div>
              <div className="p-1.5">
                <button
                  onClick={() => setLeague("all")}
                  className="w-full rounded-md px-2.5 py-2 text-left text-[11px] font-bold"
                  style={league === "all" ? { background: "#eaf3ff", color: "var(--x-blue)" } : { color: "#33415c" }}
                >
                  All competitions
                </button>
                {leagues.map((l) => (
                  <button
                    key={l.league}
                    onClick={() => setLeague(l.league)}
                    className="block w-full rounded-md px-2.5 py-2 text-left text-[11px] font-bold"
                    style={league === l.league ? { background: "#eaf3ff", color: "var(--x-blue)" } : { color: "#33415c" }}
                  >
                    <span className="block truncate">{l.league}</span>
                    <span className="block text-[10px] x-muted">{l.country}</span>
                  </button>
                ))}
              </div>
            </div>
            <Link href="/live" className="x-btn x-btn-blue h-10 w-full text-xs uppercase">🔴 Live betting</Link>
            <Link href="/casino" className="x-btn x-btn-ghost h-10 w-full text-xs uppercase">🎰 Casino</Link>
          </aside>

          <div className="grid min-w-0 gap-3">
            {Object.entries(grouped).map(([name, list]) => (
              <section key={name} className="x-card overflow-hidden">
                <div className="x-head">
                  <span className="x-title">{name}</span>
                  <span className="x-sec">{list[0]?.country}</span>
                  <span className="x-sec ml-auto">{list.length}</span>
                </div>
                {list.map((e) => (
                  <MatchRow key={e.id} event={e} />
                ))}
              </section>
            ))}
            {!data ? (
              <div className="x-card grid place-items-center p-12">
                <div className="h-9 w-9 animate-spin rounded-full border-2" style={{ borderColor: "#0b57c4", borderTopColor: "transparent" }} />
              </div>
            ) : null}
            {data && events.length === 0 ? (
              <div className="x-card p-12 text-center text-xs font-bold x-muted">No matches for this filter.</div>
            ) : null}
          </div>

          <div className="hidden lg:block"><SlipPanel /></div>
        </div>
      </div>
    </div>
  );
}

export default function SportPage() {
  return (
    <Suspense fallback={<div className="x-page p-10 text-center x-muted">Loading markets…</div>}>
      <SportInner />
    </Suspense>
  );
}
