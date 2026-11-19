"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import MatchRow, { OddBtn, TeamCrest, kickoffLabel, type PublicEvent, type PublicMarket } from "@/components/betting/MatchRow";
import SlipPanel from "@/components/betting/SlipPanel";
import { api } from "@/lib/api";
import { useApp } from "@/components/providers/AppProviders";
import { MARKET_TABS } from "@/lib/data/marketTabs";

function EventInner() {
  const { id } = useParams<{ id: string }>();
  const { slip, addLeg, removeLeg } = useApp();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [related, setRelated] = useState<PublicEvent[]>([]);
  const [group, setGroup] = useState("all");

  const load = useCallback(async () => {
    const res = await api<{ event?: PublicEvent }>(`/api/events/${id}`);
    if (res.ok && res.data.event) setEvent(res.data.event);
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!event) return;
    api<{ events?: PublicEvent[] }>(`/api/sports?sport=${event.sport}&limit=8`).then((r) => {
      if (r.ok) setRelated((r.data.events ?? []).filter((e) => e.id !== event.id).slice(0, 6));
    });
  }, [event?.id, event?.sport]);

  const markets = event?.markets ?? [];
  const tabs = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of markets) counts[m.group ?? "main"] = (counts[m.group ?? "main"] ?? 0) + 1;
    return MARKET_TABS.filter((t) => t.key === "all" || counts[t.key]);
  }, [markets]);

  const shown = markets.filter((m) => (group === "all" ? true : (m.group ?? "main") === group));

  if (!event) {
    return (
      <div className="x-page grid min-h-[70vh] place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "#0b57c4", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const live = event.status === "live";
  const on = (marketKey: string, selKey: string, line?: number) =>
    slip.some((l) => l.eventId === event.id && l.marketKey === marketKey && l.selKey === selKey && (line === undefined || l.line === line));

  const toggle = (m: PublicMarket, selKey: string, selName: string, price: number) => {
    if (on(m.key, selKey, m.line)) {
      removeLeg(event.id, m.key, m.line);
      return;
    }
    addLeg({
      eventId: event.id,
      sport: event.sport,
      league: event.league,
      home: event.home,
      away: event.away,
      marketKey: m.key,
      marketName: m.name,
      selKey,
      selName,
      line: m.line,
      price,
    });
  };

  const cols = (n: number) => (n <= 2 ? 2 : n === 3 ? 3 : n <= 6 ? 3 : n <= 12 ? 4 : 5);

  return (
    <div className="x-page">
      <div className="mx-auto max-w-[1700px] px-2 py-3 sm:px-4">
        {/* breadcrumb */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold x-muted">
          <Link href="/" className="hover:text-[#0b57c4]">Sports</Link>
          <span>›</span>
          <Link href={`/sport/${event.sport}`} className="hover:text-[#0b57c4] capitalize">{event.sport}</Link>
          <span>›</span>
          <span style={{ color: "#33415c" }}>{event.league}</span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-3">
            {/* match header */}
            <div className="x-card overflow-hidden">
              <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--x-line)", background: "#f7f9fc" }}>
                <span className="text-[11px] font-black" style={{ color: "#33415c" }}>{event.league}</span>
                <span className="text-[10px] x-muted">{event.country}</span>
                {live ? (
                  <span className="x-live x-pulse ml-auto text-[11px] font-black">● LIVE {event.minute}&apos;</span>
                ) : (
                  <span className="ml-auto text-[11px] font-black x-muted">{kickoffLabel(event.kickoff)}</span>
                )}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4">
                <div className="flex items-center justify-end gap-2 text-right">
                  <span className="truncate text-sm font-black sm:text-lg" style={{ color: "var(--x-ink)" }}>{event.home}</span>
                  <TeamCrest name={event.home} size={34} />
                </div>
                <div
                  className="tabular rounded-lg border px-4 py-2 text-center text-2xl font-black"
                  style={{ borderColor: live ? "#f6c1cd" : "var(--x-line)", background: live ? "#fff2f5" : "#f7f9fc", color: "var(--x-ink)" }}
                >
                  {live || event.status === "finished" ? `${event.homeScore} : ${event.awayScore}` : "VS"}
                  {event.htHome !== null ? <span className="block text-[10px] font-bold x-muted">HT {event.htHome}-{event.htAway}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <TeamCrest name={event.away} size={34} />
                  <span className="truncate text-sm font-black sm:text-lg" style={{ color: "var(--x-ink)" }}>{event.away}</span>
                </div>
              </div>
              {live ? (
                <div className="h-1 w-full" style={{ background: "#eef1f6" }}>
                  <div style={{ width: `${Math.min(100, (event.minute / 90) * 100)}%`, height: "100%", background: "var(--x-live)" }} />
                </div>
              ) : null}
            </div>

            {/* market tabs */}
            <div className="x-card flex gap-1 overflow-x-auto p-1.5 x-scroll">
              {tabs.map((t) => (
                <button key={t.key} className="x-tab" data-on={group === t.key ? "1" : "0"} onClick={() => setGroup(t.key)}>
                  {t.label}
                  {t.key !== "all" ? <span className="ml-1 opacity-70">{markets.filter((m) => m.group === t.key).length}</span> : null}
                </button>
              ))}
              <span className="x-sec ml-auto self-center pr-2">{markets.length} markets</span>
            </div>

            {/* markets */}
            <div className="grid gap-2">
              {shown.map((m, i) => (
                <div key={`${m.key}-${m.line ?? ""}-${i}`} className="x-card overflow-hidden">
                  <div className="x-head">
                    <span className="x-title">{m.name}</span>
                    {m.line !== undefined ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-black text-white" style={{ background: "#8a97ab" }}>
                        line {m.line}
                      </span>
                    ) : null}
                    <span className="x-sec ml-auto">{m.selections.length} selections</span>
                  </div>
                  <div className="grid gap-1.5 p-2.5" style={{ gridTemplateColumns: `repeat(${cols(m.selections.length)}, minmax(0,1fr))` }}>
                    {m.selections.map((sel) => (
                      <OddBtn
                        key={`${sel.key}-${m.line ?? ""}`}
                        label={m.selections.length > 3 ? sel.name : sel.name.length > 16 ? sel.key.toUpperCase() : sel.name}
                        price={sel.price}
                        wide
                        on={on(m.key, sel.key, m.line)}
                        onClick={() => toggle(m, sel.key, sel.name, sel.price)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {related.length ? (
              <div className="x-card overflow-hidden">
                <div className="x-head">
                  <span className="x-title">More in {event.league}</span>
                  <Link href={`/sport/${event.sport}`} className="x-sec ml-auto hover:text-[#0b57c4]">See all →</Link>
                </div>
                {related.map((e) => (
                  <MatchRow key={e.id} event={e} />
                ))}
              </div>
            ) : null}
          </div>

          <div className="hidden lg:block">
            <SlipPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EventPage() {
  return (
    <Suspense fallback={<div className="x-page p-10 text-center x-muted">Loading match…</div>}>
      <EventInner />
    </Suspense>
  );
}
