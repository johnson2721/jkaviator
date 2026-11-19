"use client";

import Gate, { PageHeader } from "@/components/auth/Gate";
import { useApp, useAuth } from "@/components/providers/AppProviders";
import { api, timeAgo } from "@/lib/api";
import { money } from "@/lib/currency";
import { multiplierColor } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type AviatorBet = {
  id: number;
  roundId: number;
  amount: number;
  status: string;
  multiplier: number | null;
  payout: number;
  autoCashoutAt: number | null;
  placedAt: string;
  crashPoint: number | null;
};

type SportBet = {
  id: number;
  currency: string;
  kind: string;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  payout: number;
  status: string;
  placedAt: string;
  selections: { home: string; away: string; marketName: string; selName: string; price: number; status?: string }[];
};

type CasinoBet = {
  id: number;
  game: string;
  currency: string;
  stake: number;
  payout: number;
  multiplier: number | null;
  createdAt: string;
};

export default function HistoryPage() {
  const { user } = useAuth();
  const { activeCurrency } = useApp();
  const [section, setSection] = useState<"sports" | "aviator" | "casino">("sports");
  const [aviator, setAviator] = useState<AviatorBet[]>([]);
  const [sports, setSports] = useState<SportBet[]>([]);
  const [casino, setCasino] = useState<CasinoBet[]>([]);

  const load = useCallback(async () => {
    const [a, s, c] = await Promise.all([
      api<{ bets?: AviatorBet[] }>("/api/bets"),
      api<{ bets?: SportBet[] }>("/api/slip?scope=all"),
      api<{ history?: CasinoBet[] }>("/api/casino/history"),
    ]);
    if (a.ok) setAviator(a.data.bets ?? []);
    if (s.ok) setSports(s.data.bets ?? []);
    if (c.ok) setCasino(c.data.history ?? []);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const staked = sports.reduce((s, b) => s + b.stake, 0) + aviator.reduce((s, b) => s + b.amount, 0) + casino.reduce((s, b) => s + b.stake, 0);
  const returned = sports.reduce((s, b) => s + b.payout, 0) + aviator.reduce((s, b) => s + b.payout, 0) + casino.reduce((s, b) => s + b.payout, 0);
  const open = sports.filter((b) => b.status === "pending").length + aviator.filter((b) => b.status === "pending").length;

  return (
    <Gate>
      <div className="mx-auto max-w-[1200px] px-3 py-5">
        <PageHeader title="My bets" subtitle="Sportsbook, Aviator and casino history across every currency account." />

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total staked", value: money(staked, activeCurrency), cls: "text-white" },
            { label: "Total returned", value: money(returned, activeCurrency), cls: "text-emerald-400" },
            { label: "Open bets", value: String(open), cls: "text-amber-400" },
            { label: "Net", value: money(returned - staked, activeCurrency), cls: returned >= staked ? "text-emerald-400" : "text-rose-400" },
          ].map((s) => (
            <div key={s.label} className="panel p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-mist">{s.label}</p>
              <p className={`tabular mt-1 text-lg font-black ${s.cls}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-3 flex gap-1 rounded-xl border border-[#1e2739] bg-[#0b1020] p-1">
          {(
            [
              ["sports", `Sports (${sports.length})`],
              ["aviator", `Aviator (${aviator.length})`],
              ["casino", `Casino (${casino.length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSection(k)}
              className={`flex-1 rounded-lg py-2 text-[11px] font-black uppercase ${section === k ? "bg-brand-red text-white" : "text-mist"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="panel overflow-hidden">
          {section === "sports" ? (
            <div className="scroll-thin max-h-[640px] overflow-auto">
              {sports.length === 0 ? (
                <p className="py-10 text-center text-xs text-mist">No sportsbook bets yet.</p>
              ) : (
                sports.map((b) => (
                  <div key={b.id} className="border-b border-[#141b2a] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[#1b2436] px-2 py-0.5 text-[10px] font-black uppercase text-white">
                        {b.kind === "accum" ? `${b.selections.length}-fold` : "single"}
                      </span>
                      <span className="tabular text-xs font-bold text-brand-gold">{b.totalOdds.toFixed(2)}</span>
                      <span className="tabular text-xs text-mist">
                        Stake {money(b.stake, b.currency)} · returns {money(b.potentialPayout, b.currency)}
                      </span>
                      <span className="ml-auto text-[10px] text-mist">{timeAgo(b.placedAt)}</span>
                      <span
                        className={`chip border ${
                          b.status === "won"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : b.status === "pending"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                              : b.status === "void"
                                ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                                : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1">
                      {b.selections.map((sel, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-[#0b1020] px-2.5 py-1.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-white">{sel.selName}</p>
                            <p className="truncate text-[10px] text-mist">
                              {sel.home} vs {sel.away} · {sel.marketName}
                            </p>
                          </div>
                          <span
                            className={`tabular shrink-0 text-xs font-black ${
                              sel.status === "won" ? "text-emerald-400" : sel.status === "lost" ? "text-rose-500" : "text-mist"
                            }`}
                          >
                            {sel.price.toFixed(2)} {sel.status && sel.status !== "pending" ? `· ${sel.status}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    {b.status === "won" ? (
                      <p className="tabular mt-2 text-right text-xs font-black text-emerald-400">
                        Paid {money(b.payout, b.currency)}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}

          {section === "aviator" ? (
            <div className="scroll-thin max-h-[640px] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#0e131f] text-[10px] uppercase tracking-wider text-mist">
                  <tr>
                    <th className="px-3 py-2">Round</th>
                    <th className="px-3 py-2">Stake</th>
                    <th className="px-3 py-2">Auto</th>
                    <th className="px-3 py-2">Crashed</th>
                    <th className="px-3 py-2 text-right">Cashed</th>
                    <th className="px-3 py-2 text-right">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {aviator.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-mist">
                        No Aviator rounds yet.
                      </td>
                    </tr>
                  ) : (
                    aviator.map((b) => (
                      <tr key={b.id} className="border-t border-[#141b2a]">
                        <td className="px-3 py-2 font-bold text-white">#{b.roundId}</td>
                        <td className="tabular px-3 py-2">{money(b.amount, activeCurrency)}</td>
                        <td className="tabular px-3 py-2 text-sky-300">{b.autoCashoutAt ? `${b.autoCashoutAt.toFixed(2)}x` : "manual"}</td>
                        <td className="px-3 py-2">
                          {b.crashPoint ? (
                            <span className={`chip border ${multiplierColor(b.crashPoint)}`}>{b.crashPoint.toFixed(2)}x</span>
                          ) : (
                            <span className="text-mist">live</span>
                          )}
                        </td>
                        <td className="tabular px-3 py-2 text-right font-black text-white">
                          {b.status === "won" && b.multiplier ? `${b.multiplier.toFixed(2)}x` : "—"}
                        </td>
                        <td className={`tabular px-3 py-2 text-right font-black ${b.status === "won" ? "text-emerald-400" : "text-rose-500"}`}>
                          {b.status === "pending" ? "in play" : money(b.payout, activeCurrency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {section === "casino" ? (
            <div className="scroll-thin max-h-[640px] overflow-auto">
              {casino.length === 0 ? (
                <p className="py-10 text-center text-xs text-mist">No casino rounds yet.</p>
              ) : (
                casino.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border-b border-[#141b2a] px-3 py-2">
                    <div>
                      <p className="text-xs font-bold capitalize text-white">{c.game}</p>
                      <p className="text-[10px] text-mist">{timeAgo(c.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-xs text-mist">
                        stake {money(c.stake, c.currency)}
                        {c.multiplier ? ` · ${c.multiplier.toFixed(2)}x` : ""}
                      </p>
                      <p className={`tabular text-sm font-black ${c.payout > 0 ? "text-emerald-400" : "text-rose-500"}`}>
                        {c.payout > 0 ? `+${money(c.payout, c.currency)}` : `−${money(c.stake, c.currency)}`}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>

        {user ? (
          <p className="mt-4 text-center text-[11px] text-mist">
            Account {user.phone} · active currency {activeCurrency} · lifetime staked {money(user.totalStaked, activeCurrency)}
          </p>
        ) : null}
      </div>
    </Gate>
  );
}
