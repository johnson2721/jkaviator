"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/currency";
import type { PublicUser } from "@/lib/api";
import type { Snapshot } from "./useGameStream";

type Props = { snapshot: Snapshot; user: PublicUser | null };

export default function LiveBets({ snapshot, user }: Props) {
  const [tab, setTab] = useState<"all" | "mine">("all");

  const rows = useMemo(() => {
    const list = snapshot.bets.filter((b) => (tab === "mine" ? user && b.userId === user.id : true));
    return [...list].sort((a, b) => b.amount - a.amount).slice(0, 60);
  }, [snapshot.bets, tab, user]);

  const won = rows.filter((r) => r.status === "won").length;
  const totalStake = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="panel-flat flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-[#1e2739] bg-[#0b1020] p-2">
        {(["all", "mine"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black uppercase tracking-wider transition ${
              tab === t ? "bg-[#1b2436] text-white" : "text-mist hover:text-white"
            }`}
          >
            {t === "all" ? `All bets ${snapshot.bets.length}` : "My bets"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-b border-[#141b2a] px-3 py-1.5 text-[10px] font-bold text-mist">
        <span>
          <span className="text-emerald-400">{won}</span> cashed out ·{" "}
          <span className="text-white">{totalStake.toLocaleString()}</span> staked
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-emerald-400" />
          {snapshot.online} online
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-[#141b2a] px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-mist">
        <span>Player</span>
        <span className="text-right">Bet</span>
        <span className="w-24 text-right">Cash out</span>
      </div>

      <div className="scroll-thin max-h-[560px] min-h-[240px] flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-mist">
            {tab === "mine" ? "You have no bet in this round yet." : "Waiting for players to stake…"}
          </p>
        ) : (
          rows.map((b) => {
            const mine = user?.id === b.userId;
            return (
              <div
                key={b.id}
                className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-[#101724] px-3 py-1.5 text-xs transition ${
                  b.status === "won"
                    ? "bg-emerald-500/8"
                    : b.status === "lost"
                      ? "opacity-45"
                      : ""
                } ${mine ? "ring-1 ring-inset ring-brand-blue/40" : ""}`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-black ${
                      mine ? "bg-brand-blue text-white" : "bg-[#1b2436] text-mist"
                    }`}
                  >
                    {b.name.charAt(0)}
                  </span>
                  <span className="truncate font-semibold text-slate-200">{mine ? "You" : b.name}</span>
                  {b.autoCashoutAt ? (
                    <span className="shrink-0 rounded bg-[#1b2436] px-1 py-0.5 text-[9px] font-bold text-sky-300">
                      A {b.autoCashoutAt.toFixed(2)}x
                    </span>
                  ) : null}
                </span>
                <span className="tabular text-right font-bold text-slate-300">{b.amount.toLocaleString()} <span className="text-[9px] text-mist">{b.currency}</span></span>
                <span className="tabular w-24 text-right font-black">
                  {b.status === "won" ? (
                    <span className="text-emerald-400">
                      {b.cashoutAt?.toFixed(2)}x · {money(b.payout ?? 0, b.currency || "KES")}
                    </span>
                  ) : b.status === "lost" ? (
                    <span className="text-rose-500">—</span>
                  ) : (
                    <span className="text-mist">in play</span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
