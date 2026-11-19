"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/AppProviders";

export type MarketSelection = { key: string; name: string; price: number; line?: number };
export type PublicMarket = {
  key: string;
  name: string;
  short: string;
  group?: string;
  type: string;
  line?: number;
  selections: { key: string; name: string; price: number }[];
};
export type PublicEvent = {
  id: number;
  sport: string;
  league: string;
  country: string | null;
  home: string;
  away: string;
  kickoff: string;
  status: string;
  minute: number;
  homeScore: number;
  awayScore: number;
  htHome: number | null;
  htAway: number | null;
  featured: boolean;
  markets: PublicMarket[];
  main: { key: string; short: string; selections: MarketSelection[] } | null;
  marketCount: number;
};

const CRESTS = ["#c8102e", "#0b57c4", "#0f9d58", "#f2a900", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];

export function crestColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return CRESTS[h % CRESTS.length];
}

export function TeamCrest({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="x-cup" style={{ width: size, height: size, background: crestColor(name), fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

export function kickoffLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
  return `${tomorrow ? "Tmrw" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${time}`;
}

export function OddBtn({
  label,
  price,
  on,
  onClick,
  wide,
}: {
  label: string;
  price: number;
  on?: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button className="x-odd" data-on={on ? "1" : "0"} onClick={onClick} style={wide ? { minWidth: 84 } : undefined}>
      <span className="x-odd-k">{label}</span>
      <span className="x-odd-v">{price.toFixed(2)}</span>
    </button>
  );
}

/** 1xBet-style dense match row: time | teams + score | 1X2 | +markets */
export default function MatchRow({ event, showLeague = false }: { event: PublicEvent; showLeague?: boolean }) {
  const { slip, addLeg, removeLeg } = useApp();
  const live = event.status === "live";
  const main = event.main;
  const totals = event.markets.find((m) => m.key === "ou");
  const dc = event.markets.find((m) => m.key === "dc");

  const isOn = (marketKey: string, key: string, line?: number) =>
    slip.some((l) => l.eventId === event.id && l.marketKey === marketKey && l.selKey === key && (line === undefined || l.line === line));

  const toggle = (marketKey: string, selKey: string, selName: string, price: number, line?: number) => {
    const market = event.markets.find((m) => m.key === marketKey && (line === undefined || m.line === line));
    if (!market) return;
    if (isOn(marketKey, selKey, line)) {
      removeLeg(event.id, marketKey, line);
      return;
    }
    addLeg({
      eventId: event.id,
      sport: event.sport,
      league: event.league,
      home: event.home,
      away: event.away,
      marketKey,
      marketName: market.name,
      selKey,
      selName,
      line: line ?? market.line,
      price,
    });
  };

  return (
    <div>
      {showLeague ? (
        <div className="x-league">
          <span>🏆</span>
          <span>{event.league}</span>
          <span className="x-muted" style={{ fontWeight: 600 }}>· {event.country}</span>
        </div>
      ) : null}
      <div className="x-row">
        <div className="x-time">
          {live ? (
            <>
              <span className="x-live x-pulse">● {event.minute}&apos;</span>
              <span className="block text-[9px] font-bold" style={{ color: "#98a4b8" }}>LIVE</span>
            </>
          ) : (
            <>
              <span>{kickoffLabel(event.kickoff).split(" ")[0]}</span>
              <span className="block text-[9px] font-bold" style={{ color: "#98a4b8" }}>
                {kickoffLabel(event.kickoff).split(" ")[1] ?? ""}
              </span>
            </>
          )}
        </div>

        <Link href={`/event/${event.id}`} className="grid min-w-0 gap-1">
          <span className="x-team">
            <TeamCrest name={event.home} />
            <span className="truncate">{event.home}</span>
            {live || event.status === "finished" ? <span className="x-score ml-auto">{event.homeScore}</span> : null}
          </span>
          <span className="x-team">
            <TeamCrest name={event.away} />
            <span className="truncate">{event.away}</span>
            {live || event.status === "finished" ? <span className="x-score ml-auto">{event.awayScore}</span> : null}
          </span>
          {live && event.htHome !== null ? (
            <span className="text-[9px] font-bold" style={{ color: "#98a4b8" }}>
              HT {event.htHome}-{event.htAway}
            </span>
          ) : null}
        </Link>

        <div className="flex items-center gap-1">
          {main ? (
            <div className="hidden gap-1 sm:flex">
              {main.selections.slice(0, 3).map((sel) => (
                <OddBtn
                  key={`${sel.key}-${sel.line ?? ""}`}
                  label={main.short === "1X2" ? sel.key : sel.name.split(" ")[0].slice(0, 6)}
                  price={sel.price}
                  on={isOn(main.key, sel.key, sel.line)}
                  onClick={() => toggle(main.key, sel.key, sel.name, sel.price, sel.line)}
                />
              ))}
            </div>
          ) : null}
          {totals && !live ? (
            <div className="hidden gap-1 lg:flex">
              {totals.selections.map((sel) => (
                <OddBtn
                  key={sel.key}
                  label={`${sel.key === "over" ? "O" : "U"} ${totals.line}`}
                  price={sel.price}
                  on={isOn("ou", sel.key, totals.line)}
                  onClick={() => toggle("ou", sel.key, sel.name, sel.price, totals.line)}
                />
              ))}
            </div>
          ) : null}
          {dc && !live ? (
            <div className="hidden gap-1 xl:flex">
              {dc.selections.map((sel) => (
                <OddBtn
                  key={sel.key}
                  label={sel.key}
                  price={sel.price}
                  on={isOn("dc", sel.key)}
                  onClick={() => toggle("dc", sel.key, sel.name, sel.price)}
                />
              ))}
            </div>
          ) : null}
          <Link href={`/event/${event.id}`} className="x-more">
            +{event.marketCount}
          </Link>
        </div>
      </div>
    </div>
  );
}
