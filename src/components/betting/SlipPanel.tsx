"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { money, roundMoney } from "@/lib/currency";
import { useApp, useAuth, useToast } from "@/components/providers/AppProviders";

export default function SlipPanel() {
  const { slip, removeLeg, clearSlip, slipOpen, setSlipOpen, user, activeCurrency, activeWallet, refresh } = useApp();
  const { push } = useToast();
  const [stake, setStake] = useState(50);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ odds: number; payout: number; id: number } | null>(null);
  const [tab, setTab] = useState<"slip" | "open">("slip");

  const totalOdds = slip.reduce((acc, l) => acc * l.price, 1);
  const payout = roundMoney(stake * totalOdds, activeCurrency);
  const balance = activeWallet?.balance ?? user?.balance ?? 0;
  const kind = slip.length > 1 ? `${slip.length}-fold accumulator` : "Single";

  useEffect(() => {
    if (!slip.length) setReceipt(null);
  }, [slip.length]);
  useEffect(() => {
    setStake(activeCurrency === "KES" ? 50 : 1);
  }, [activeCurrency]);

  const place = async () => {
    if (!user) {
      push("Log in to place this bet.", "error");
      return;
    }
    if (!slip.length || stake <= 0) return;
    if (stake > balance) {
      push(`Not enough ${activeCurrency}. Deposit to continue.`, "error");
      return;
    }
    setBusy(true);
    const res = await api<{ ok?: boolean; betId?: number; totalOdds?: number; potentialPayout?: number; error?: string }>(
      "/api/slip",
      { method: "POST", json: { stake, slip } },
    );
    setBusy(false);
    if (!res.ok) {
      push(errorMessage(res.data, "Bet rejected."), "error");
      return;
    }
    setReceipt({ id: res.data.betId ?? 0, odds: res.data.totalOdds ?? totalOdds, payout: res.data.potentialPayout ?? payout });
    push(`${kind} placed — ${money(stake, activeCurrency)} at ${(res.data.totalOdds ?? totalOdds).toFixed(2)}.`, "success");
    clearSlip();
    await refresh();
  };

  const quick = activeCurrency === "KES" ? [50, 100, 500, 1000] : [1, 5, 10, 50];

  const body = (
    <>
      <div className="x-head" style={{ borderRadius: 0 }}>
        <span className="x-title">Bet slip</span>
        <span
          className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black text-white"
          style={{ background: slip.length ? "var(--x-blue)" : "#c3ccd9" }}
        >
          {slip.length}
        </span>
        <span className="x-sec ml-auto">{kind}</span>
        <button onClick={() => setSlipOpen(false)} className="x-muted ml-1 text-sm font-black lg:hidden">✕</button>
      </div>

      <div className="flex gap-1 border-b px-2 py-1.5" style={{ borderColor: "var(--x-line)" }}>
        <button className="x-tab" data-on={tab === "slip" ? "1" : "0"} onClick={() => setTab("slip")}>
          Selections
        </button>
        <Link href="/history" className="x-tab" onClick={() => setSlipOpen(false)}>
          Open bets
        </Link>
      </div>

      {receipt ? (
        <div className="p-3">
          <div className="rounded-lg border p-3 text-center" style={{ borderColor: "#b7e4c7", background: "#eafaf0" }}>
            <p className="x-sec" style={{ color: "#15803d" }}>Bet accepted</p>
            <p className="text-2xl font-black" style={{ color: "var(--x-ink)" }}>#{receipt.id}</p>
            <p className="text-[11px] font-bold" style={{ color: "#33415c" }}>
              Odds {receipt.odds.toFixed(2)} · potential {money(receipt.payout, activeCurrency)}
            </p>
          </div>
          <button onClick={() => setReceipt(null)} className="x-btn x-btn-ghost mt-2 h-9 w-full text-xs uppercase">
            New bet
          </button>
        </div>
      ) : null}

      {slip.length === 0 && !receipt ? (
        <div className="p-6 text-center">
          <p className="text-3xl">🎟️</p>
          <p className="mt-2 text-xs font-black" style={{ color: "var(--x-ink)" }}>Your bet slip is empty</p>
          <p className="mt-1 text-[11px] leading-relaxed x-muted">
            Tap any price to add a selection. Combine matches from different leagues into one accumulator for bigger
            returns.
          </p>
          <Link href="/live" className="x-btn x-btn-blue mt-3 h-9 w-full text-xs uppercase" onClick={() => setSlipOpen(false)}>
            Go to live betting
          </Link>
        </div>
      ) : null}

      {slip.length ? (
        <>
          <div className="x-scroll max-h-[38vh] overflow-y-auto">
            {slip.map((leg) => (
              <div key={`${leg.eventId}-${leg.marketKey}-${leg.line ?? ""}`} className="border-b p-2.5" style={{ borderColor: "#eef1f6" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-black" style={{ color: "var(--x-ink)" }}>{leg.selName}</p>
                    <p className="truncate text-[10px] font-bold x-muted">
                      {leg.marketName}
                      {leg.line !== undefined ? ` (${leg.line})` : ""}
                    </p>
                    <p className="truncate text-[10px]" style={{ color: "#8a97ab" }}>
                      {leg.home} vs {leg.away}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded px-1.5 py-0.5 text-xs font-black text-white" style={{ background: "var(--x-blue)" }}>
                      {leg.price.toFixed(2)}
                    </span>
                    <button onClick={() => removeLeg(leg.eventId, leg.marketKey, leg.line)} className="x-muted hover:text-rose-600" aria-label="remove">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3">
            <div className="mb-2 flex gap-1">
              {quick.map((q) => (
                <button key={q} onClick={() => setStake(q)} className="x-btn x-btn-ghost h-7 flex-1 text-[11px]">
                  {q}
                </button>
              ))}
              <button onClick={() => setStake(roundMoney(balance, activeCurrency))} className="x-btn x-btn-gold h-7 flex-1 text-[11px]">
                MAX
              </button>
            </div>
            <div className="relative">
              <input type="number" min={0} value={stake} onChange={(e) => setStake(Number(e.target.value))} className="x-input pr-14 text-base" />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[10px] font-black x-muted">{activeCurrency}</span>
            </div>

            <div className="mt-2 grid gap-1 text-[11px] font-bold">
              <div className="flex justify-between">
                <span className="x-muted">Total odds</span>
                <span className="font-black" style={{ color: "var(--x-ink)" }}>{totalOdds.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="x-muted">Balance</span>
                <span>{money(balance, activeCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="x-muted">Potential payout</span>
                <span className="font-black" style={{ color: "#15803d" }}>{money(payout, activeCurrency)}</span>
              </div>
            </div>

            {user ? (
              <button onClick={() => void place()} disabled={busy} className="x-btn x-btn-green mt-3 h-12 w-full text-sm uppercase">
                {busy ? "Placing…" : `Place bet · ${money(stake, activeCurrency)}`}
              </button>
            ) : (
              <Link href="/login" className="x-btn x-btn-green mt-3 h-12 w-full pt-3 text-center text-sm uppercase" onClick={() => setSlipOpen(false)}>
                Log in to bet
              </Link>
            )}
            <button onClick={clearSlip} className="mt-1.5 w-full text-[11px] font-bold x-muted hover:text-rose-600">
              Clear slip
            </button>
          </div>
        </>
      ) : null}
    </>
  );

  return (
    <>
      {slip.length && !slipOpen ? (
        <button onClick={() => setSlipOpen(true)} className="x-btn x-btn-green fixed bottom-16 left-1/2 z-[95] h-11 w-[min(92vw,420px)] -translate-x-1/2 text-xs uppercase shadow-2xl lg:hidden">
          Bet slip · {slip.length} · {totalOdds.toFixed(2)}
        </button>
      ) : null}

      <aside className="sticky top-[116px] hidden max-h-[calc(100vh-7rem)] overflow-y-auto x-scroll lg:block">
        <div className="x-card overflow-hidden">{body}</div>
      </aside>

      {slipOpen ? (
        <div className="fixed inset-0 z-[115] lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSlipOpen(false)} />
          <div className="animate-slide-up absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl">
            {body}
          </div>
        </div>
      ) : null}
    </>
  );
}
