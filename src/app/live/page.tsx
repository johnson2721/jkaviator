"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MatchRow, { type PublicEvent } from "@/components/betting/MatchRow";
import SlipPanel from "@/components/betting/SlipPanel";
import { api } from "@/lib/api";
import { sportIcon } from "@/lib/data/sports";

type Res = { sports: { key: string; name: string; count: number }[]; events: PublicEvent[] };

export default function LivePage() {
  const [data, setData] = useState<Res | null>(null);
  const [sport, setSport] = useState("all");
  const [view, setView] = useState<"multi" | "list">("list");

  const load = useCallback(async () => {
    const res = await api<Res>(`/api/sports?live=1&limit=120${sport === "all" ? "" : `&sport=${sport}`}`);
    if (res.ok) setData(res.data);
  }, [sport]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const events = data?.events ?? [];
  const grouped = events.reduce<Record<string, PublicEvent[]>>((acc, e) => {
    const key = `${e.sport}|${e.league}`;
    acc[key] = acc[key] ?? [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <div className="x-page">
      <div className="mx-auto max-w-[1700px] px-2 py-3 sm:px-4">
        <div className="x-card mb-3 flex flex-wrap items-center gap-2 p-3">
          <span className="x-live x-pulse text-lg">●</span>
          <div>
            <h1 className="font-display text-lg font-black" style={{ color: "var(--x-ink)" }}>MULTI-LIVE</h1>
            <p className="text-[11px] font-bold x-muted">{events.length} matches in play · prices and scores refresh every 5 seconds</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <button className="x-tab" data-on={view === "list" ? "1" : "0"} onClick={() => setView("list")}>List</button>
            <button className="x-tab" data-on={view === "multi" ? "1" : "0"} onClick={() => setView("multi")}>Multi view</button>
            <span className="mx-1 h-5 w-px" style={{ background: "var(--x-line)" }} />
            <button className="x-tab" data-on={sport === "all" ? "1" : "0"} onClick={() => setSport("all")}>All</button>
            {(data?.sports ?? []).map((s) => (
              <button key={s.key} className="x-tab" data-on={sport === s.key ? "1" : "0"} onClick={() => setSport(s.key)}>
                {sportIcon(s.key)} {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-3">
            {events.length === 0 ? (
              <div className="x-card grid place-items-center p-14 text-center">
                <p className="text-4xl">📡</p>
                <p className="mt-2 text-sm font-black" style={{ color: "var(--x-ink)" }}>No live matches right now</p>
                <p className="mt-1 max-w-sm text-xs x-muted">
                  Matches go live automatically at kick-off. Browse the pre-match list and your slip will carry over.
                </p>
                <Link href="/" className="x-btn x-btn-blue mt-3 h-9 px-4 text-xs uppercase">Back to sports</Link>
              </div>
            ) : view === "list" ? (
              Object.entries(grouped).map(([key, list]) => {
                const [sp, league] = key.split("|");
                return (
                  <section key={key} className="x-card overflow-hidden">
                    <div className="x-head">
                      <span>{sportIcon(sp)}</span>
                      <span className="x-title">{league}</span>
                      <span className="x-sec ml-auto">{list.length} live</span>
                    </div>
                    {list.map((e) => (
                      <MatchRow key={e.id} event={e} />
                    ))}
                  </section>
                );
              })
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {events.map((e) => (
                  <div key={e.id} className="x-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="x-live x-pulse text-[11px] font-black">● {e.minute}&apos;</span>
                      <span className="text-[10px] font-bold x-muted">{e.league}</span>
                    </div>
                    <Link href={`/event/${e.id}`} className="mt-2 grid gap-1">
                      <span className="x-team"><span className="truncate">{e.home}</span><span className="x-score ml-auto">{e.homeScore}</span></span>
                      <span className="x-team"><span className="truncate">{e.away}</span><span className="x-score ml-auto">{e.awayScore}</span></span>
                    </Link>
                    {e.main ? (
                      <div className="mt-2.5 grid grid-cols-3 gap-1">
                        {e.main.selections.slice(0, 3).map((sel) => (
                          <Link key={sel.key} href={`/event/${e.id}`} className="x-odd">
                            <span className="x-odd-k">{e.main?.short === "1X2" ? sel.key : sel.name.split(" ")[0].slice(0, 6)}</span>
                            <span className="x-odd-v">{sel.price.toFixed(2)}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    <Link href={`/event/${e.id}`} className="x-sec mt-2 block text-center hover:text-[#0b57c4]">
                      +{e.marketCount} markets
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="hidden lg:block"><SlipPanel /></div>
        </div>
      </div>
    </div>
  );
}
