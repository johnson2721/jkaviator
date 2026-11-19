"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { money } from "@/lib/currency";
import { useApp } from "@/components/providers/AppProviders";
import { GAME } from "@/lib/game/config";
import type { PublicUser } from "@/lib/api";
import { liveMultiplier, type GameRef, type Snapshot } from "./useGameStream";

type Props = {
  user: PublicUser;
  refreshUser: () => Promise<void>;
  gameRef: React.RefObject<GameRef>;
  snapshot: Snapshot;
  toast: (text: string, kind?: "success" | "error" | "info") => void;
};

const QUICK = [100, 200, 500, 1000];

export default function BetPanel({ user, refreshUser, gameRef, snapshot, toast }: Props) {
  const { openGate } = useApp();
  const guest = !user || user.id === 0;
  const ccy = user?.currency || "KES";
  const kes = (v: number | string) => money(Number(v), ccy);
  const [amount, setAmount] = useState(100);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [autoValue, setAutoValue] = useState(2);
  const [autoBet, setAutoBet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"bet" | "auto">("bet");
  const [localBetId, setLocalBetId] = useState<number | null>(null);
  const autoRoundRef = useRef(0);
  const cashoutAmountRef = useRef<HTMLSpanElement | null>(null);
  const cashoutMultRef = useRef<HTMLSpanElement | null>(null);

  const myBet = snapshot.bets.find(
    (b) => !b.simulated && b.userId === user.id && b.status === "pending" && b.id === localBetId,
  );
  const anyPendingMine = snapshot.bets.find(
    (b) => !b.simulated && b.userId === user.id && b.status === "pending",
  );
  const activeBet = myBet ?? anyPendingMine ?? null;
  const phase = snapshot.phase;

  // Reset the local pointer when a new round starts.
  useEffect(() => {
    if (phase === "waiting") setLocalBetId(null);
  }, [phase, snapshot.roundId]);

  const place = async (auto = false) => {
    if (busy) return;
    if (amount < GAME.MIN_BET) {
      toast(`Minimum stake is ${GAME.MIN_BET} KES.`, "error");
      return;
    }
    if (amount > (user?.balance ?? 0)) {
      toast("Insufficient balance — top up your wallet.", "error");
      return;
    }
    setBusy(true);
    const res = await api<{ ok?: boolean; betId?: number; error?: string }>("/api/bets", {
      method: "POST",
      json: { amount, autoCashoutEnabled: autoEnabled, autoCashout: autoEnabled ? autoValue : null },
    });
    setBusy(false);
    if (!res.ok) {
      toast(errorMessage(res.data, "Bet rejected."), "error");
      return;
    }
    setLocalBetId(res.data.betId ?? null);
    await refreshUser();
    if (!auto) toast(`Stake placed: ${kes(amount)} KES on round #${snapshot.roundId}.`, "success");
  };

  const cashOut = async () => {
    if (!activeBet || busy) return;
    setBusy(true);
    const res = await api<{ ok?: boolean; multiplier?: number; payout?: number }>("/api/bets/cashout", {
      method: "POST",
      json: { betId: activeBet.id },
    });
    setBusy(false);
    if (!res.ok) {
      toast(errorMessage(res.data, "Cash out failed."), "error");
      await refreshUser();
      return;
    }
    toast(
      `Cashed out at ${res.data.multiplier?.toFixed(2)}x — won ${kes(res.data.payout ?? 0)} KES!`,
      "success",
    );
    setLocalBetId(null);
    await refreshUser();
  };

  // Auto-bet for the next round
  useEffect(() => {
    if (!autoBet || phase !== "waiting") return;
    if (autoRoundRef.current === snapshot.roundId) return;
    if (activeBet) return;
    autoRoundRef.current = snapshot.roundId;
    void place(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBet, phase, snapshot.roundId]);

  // Live cash-out value
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const r = gameRef.current;
      if (r && cashoutAmountRef.current && cashoutMultRef.current) {
        const m = liveMultiplier(r);
        cashoutMultRef.current.textContent = `${m.toFixed(2)}x`;
        cashoutAmountRef.current.textContent = kes(amount * m);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [amount, gameRef]);

  const flying = phase === "flying";
  const canBet = phase === "waiting" && !activeBet;

  return (
    <div className="panel-flat overflow-hidden">
      <div className="flex items-center gap-1 border-b border-[#1e2739] bg-[#0b1020] p-2">
        {(["bet", "auto"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
              tab === t ? "bg-[#1b2436] text-white" : "text-mist hover:text-white"
            }`}
          >
            {t === "bet" ? "Bet" : "Auto"}
          </button>
        ))}
        <span className="ml-auto pr-2 text-[10px] font-bold text-mist">
          ROUND #{snapshot.roundId}
        </span>
      </div>

      <div className="p-3">
        {tab === "bet" ? (
          <div className="grid gap-3">
            <div className="flex items-stretch gap-2">
              <button
                onClick={() => setAmount((a) => Math.max(GAME.MIN_BET, Math.floor(a - 10)))}
                className="btn btn-ghost w-10 text-lg"
                aria-label="decrease stake"
              >
                −
              </button>
              <div className="relative flex-1">
                <input
                  type="number"
                  min={GAME.MIN_BET}
                  max={GAME.MAX_BET}
                  step={10}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                  className="input tabular text-center text-lg font-black"
                  disabled={!!activeBet}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] font-bold text-mist">
                  {ccy}
                </span>
              </div>
              <button
                onClick={() => setAmount((a) => Math.min(GAME.MAX_BET, Math.floor(a + 10)))}
                className="btn btn-ghost w-10 text-lg"
                aria-label="increase stake"
              >
                +
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(q)}
                  disabled={!!activeBet}
                  className="tabular rounded-lg border border-[#26314a] bg-[#0b1020] py-1.5 text-[11px] font-bold text-mist transition hover:border-brand-blue/60 hover:text-white disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>

            {guest ? (
              <button onClick={() => openGate("Log in to stake real money on Aviator.")} className="btn btn-bet h-14 w-full text-base">
                LOG IN TO PLAY
              </button>
            ) : canBet ? (
              <button onClick={() => void place()} disabled={busy} className="btn btn-bet h-14 w-full text-base">
                <span className="flex flex-col items-center leading-tight">
                  <span>BET</span>
                  <span className="tabular text-[11px] font-bold opacity-80">{kes(amount)} KES</span>
                </span>
              </button>
            ) : flying && activeBet ? (
              <button onClick={() => void cashOut()} disabled={busy} className="btn btn-cashout h-14 w-full text-base">
                <span className="flex flex-col items-center leading-tight">
                  <span>CASH OUT</span>
                  <span className="tabular text-sm font-black">
                    <span ref={cashoutAmountRef}>{kes(amount)}</span> {ccy}
                  </span>
                </span>
              </button>
            ) : activeBet ? (
              <button className="btn h-14 w-full cursor-not-allowed bg-[#1b2436] text-base text-mist">
                <span className="flex flex-col items-center leading-tight">
                  <span className="animate-blink">WAITING FOR TAKE-OFF…</span>
                  <span className="tabular text-[11px] font-bold opacity-70">
                    {kes(activeBet.amount)} {activeBet.currency || ccy}
                    {activeBet.autoCashoutAt ? ` · auto ${activeBet.autoCashoutAt.toFixed(2)}x` : ""}
                  </span>
                </span>
              </button>
            ) : (
              <button className="btn h-14 w-full cursor-not-allowed bg-[#1b2436] text-base text-mist">
                BETTING CLOSED
              </button>
            )}

            <p className="text-center text-[10px] leading-relaxed text-mist">
              Limits are set per currency account · auto cash-out up to{" "}
              {GAME.MAX_AUTO_CASHOUT}x
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            <label className="flex items-center justify-between rounded-xl border border-[#26314a] bg-[#0b1020] px-3 py-2.5">
              <span>
                <span className="block text-sm font-bold text-white">Auto cash-out</span>
                <span className="block text-[11px] text-mist">Cashes out automatically at your multiplier</span>
              </span>
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={(e) => setAutoEnabled(e.target.checked)}
                className="h-5 w-9 accent-[#16c784]"
              />
            </label>

            <div className={`flex items-center gap-2 ${autoEnabled ? "" : "pointer-events-none opacity-40"}`}>
              <input
                type="number"
                step={0.01}
                min={1.01}
                max={GAME.MAX_AUTO_CASHOUT}
                value={autoValue}
                onChange={(e) => setAutoValue(Number(e.target.value))}
                className="input tabular w-28 text-center text-lg font-black"
              />
              <span className="text-sm font-black text-mist">×</span>
              <div className="ml-auto grid grid-cols-4 gap-1">
                {[1.5, 2, 3, 5].map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setAutoValue(v);
                      setAutoEnabled(true);
                    }}
                    className="tabular rounded-lg border border-[#26314a] bg-[#0b1020] px-2 py-1.5 text-[11px] font-bold text-mist hover:text-white"
                  >
                    {v}x
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between rounded-xl border border-[#26314a] bg-[#0b1020] px-3 py-2.5">
              <span>
                <span className="block text-sm font-bold text-white">Auto bet</span>
                <span className="block text-[11px] text-mist">Re-stakes {kes(amount)} every round</span>
              </span>
              <input
                type="checkbox"
                checked={autoBet}
                onChange={(e) => {
                  setAutoBet(e.target.checked);
                  autoRoundRef.current = 0;
                }}
                className="h-5 w-9 accent-[#16c784]"
              />
            </label>

            <div className="rounded-xl border border-[#26314a] bg-[#0b1020] px-3 py-2 text-[11px] leading-relaxed text-mist">
              {autoEnabled
                ? `Auto cash-out is ON at ${autoValue.toFixed(2)}x. The server settles it the instant the plane passes your multiplier — no click needed.`
                : "Auto cash-out is OFF. You must tap CASH OUT before the plane flies away."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
