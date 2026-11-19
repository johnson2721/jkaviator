"use client";

import Gate, { PageHeader } from "@/components/auth/Gate";
import { useAuth, useToast } from "@/components/providers/AppProviders";
import { api, errorMessage, timeAgo } from "@/lib/api";
import { money } from "@/lib/currency";
import { useApp } from "@/components/providers/AppProviders";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

type Tx = {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  status: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
};

type DepositState = {
  reference: string;
  amount: number;
  phone: string;
  status: "pending" | "completed" | "failed";
  startedAt: number;
};

const QUICK_KES = [100, 500, 1000, 2500, 5000, 10000];

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="label mb-1 block">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-[10px] leading-relaxed text-mist">{hint}</p> : null}
    </div>
  );
}

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

function formatCard(v: string) {
  return digitsOnly(v).slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(v: string) {
  const d = digitsOnly(v).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

function WalletInner() {
  const params = useSearchParams();
  const { user, refresh } = useAuth();
  const { wallets, currencies, activeCurrency, switchCurrency, openGate } = useApp();
  const { push } = useToast();

  const ccyMeta = currencies.find((c) => c.code === activeCurrency) ?? currencies[0];
  const DEP_METHODS = ccyMeta?.methods?.length ? ccyMeta.methods : ["M-PESA"];
  const scale = activeCurrency === "KES" ? 1 : ccyMeta ? ccyMeta.usdRate / 129 : 1;
  const QUICK_DEPOSIT = QUICK_KES.map((q) => Math.max(1, Math.round(q * scale * 100) / 100));
  const minDep = Math.max(1, Math.round(50 * scale * 100) / 100);
  const minWd = Math.max(1, Math.round(100 * scale * 100) / 100);
  const kes = (v: number | string, _d = 2) => money(Number(v), activeCurrency);
  const { push: _push } = { push };
  void _push;
  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">(
    (params.get("tab") as "deposit" | "withdraw" | "history") ?? "deposit",
  );

  /* ------------------------------------------------------------- deposit */
  const [amount, setAmount] = useState(500);
  const [depMethod, setDepMethod] = useState("");
  const [depPhone, setDepPhone] = useState("");
  const [depBusy, setDepBusy] = useState(false);
  const [dep, setDep] = useState<DepositState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ------------------------------------------------------------ withdraw */
  const [wdAmount, setWdAmount] = useState(500);
  const [wdMethod, setWdMethod] = useState<"MPESA" | "VISA">("MPESA");
  const [mpesa, setMpesa] = useState({ fullName: "", phone: "", idNumber: "" });
  const [card, setCard] = useState({ cardName: "", cardNumber: "", expiry: "", cvv: "", bank: "" });
  const [wdBusy, setWdBusy] = useState(false);
  const [wdDone, setWdDone] = useState<string | null>(null);

  const [txs, setTxs] = useState<Tx[]>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (user?.phone) {
      setDepPhone((p) => p || user.phone);
      setMpesa((m) => ({ ...m, phone: m.phone || user.phone, fullName: m.fullName || user.name }));
      setCard((c) => ({ ...c, cardName: c.cardName || user.name }));
    }
  }, [user]);

  const loadTxs = useCallback(async () => {
    const res = await api<{ transactions?: Tx[] }>("/api/wallet/transactions");
    if (res.ok) setTxs(res.data.transactions ?? []);
  }, []);

  useEffect(() => {
    void loadTxs();
  }, [loadTxs, tab]);

  /* ------------------------------------------------ deposit polling loop */
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollDeposit = useCallback(
    (reference: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        const res = await api<{ state?: string; balance?: number; error?: string }>(
          `/api/wallet/deposit/status?reference=${encodeURIComponent(reference)}`,
        );
        if (!res.ok) return;
        const state = res.data.state;
        if (state === "completed") {
          stopPolling();
          setDep((d) => (d ? { ...d, status: "completed" } : d));
          await refresh();
          void loadTxs();
          push(`Deposit confirmed — ${kes(res.data.balance ?? 0)} available to play.`, "success");
        } else if (state === "failed" || state === "not_found") {
          stopPolling();
          setDep((d) => (d ? { ...d, status: "failed" } : d));
          void loadTxs();
          push("The payment was not completed. You have not been charged.", "error");
        }
      }, 3000);
    },
    [push, refresh, loadTxs],
  );

  useEffect(() => () => stopPolling(), []);

  const startDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (amount < 50) {
      setNotice({ kind: "err", text: "Minimum deposit is KES 50." });
      return;
    }
    setDepBusy(true);
    const res = await api<{ ok?: boolean; reference?: string; error?: string }>("/api/wallet/deposit", {
      method: "POST",
      json: { amount, method: depMethod || DEP_METHODS[0], phone: depPhone, currency: activeCurrency },
    });
    setDepBusy(false);
    if (!res.ok || !res.data.reference) {
      setNotice({ kind: "err", text: errorMessage(res.data, "Could not start the deposit.") });
      return;
    }
    const state: DepositState = {
      reference: res.data.reference,
      amount,
      phone: depPhone,
      status: "pending",
      startedAt: Date.now(),
    };
    setDep(state);
    pollDeposit(state.reference);
  };

  /* ------------------------------------------------------- withdraw flow */
  const submitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setWdDone(null);
    if (wdAmount > (user?.balance ?? 0)) {
      setNotice({ kind: "err", text: "You cannot withdraw more than your available balance." });
      return;
    }
    setWdBusy(true);
    const payload =
      wdMethod === "MPESA"
        ? { amount: wdAmount, method: "MPESA", ...mpesa }
        : { amount: wdAmount, method: "VISA", phone: mpesa.phone, ...card };
    const res = await api<{ ok?: boolean; reference?: string; error?: string }>("/api/wallet/withdraw", {
      method: "POST",
      json: payload,
    });
    setWdBusy(false);
    if (!res.ok) {
      setNotice({ kind: "err", text: errorMessage(res.data, "Could not submit the withdrawal.") });
      return;
    }
    await refresh();
    void loadTxs();
    setWdDone(res.data.reference ?? "");
    setNotice({
      kind: "ok",
      text: `Withdrawal of ${kes(wdAmount)} KES submitted. Our payments desk has received your details and is processing it — you can follow the status under Transactions.`,
    });
    push("Withdrawal request submitted.", "success");
  };

  const pendingWd = txs.filter((t) => t.type === "withdrawal" && t.status === "pending");

  /* ------------------------------------------------------------------ UI */
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6">
      <PageHeader
        title="Wallet"
        subtitle="Deposit with M-Pesa, fly with your balance, and cash out to M-Pesa or your Visa card."
        right={
          <div className="panel-flat px-4 py-2 text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-mist">Playable balance</p>
            <p className="tabular text-xl font-black text-brand-gold">{kes(user?.balance ?? 0)} {activeCurrency}</p>
            {pendingWd.length ? (
              <p className="text-[11px] text-amber-400">
                {kes(pendingWd.reduce((s, t) => s + Math.abs(t.amount), 0), 0)} KES on hold
              </p>
            ) : null}
          </div>
        }
      />

      <div className="panel-flat mb-3 p-3">
        <div className="flex items-center justify-between">
          <p className="label">Currency accounts</p>
          <p className="text-[10px] text-mist">Each account has its own balance</p>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto hide-scroll">
          {currencies.map((c) => {
            const w = wallets.find((x) => x.currency === c.code);
            const active = c.code === activeCurrency;
            return (
              <button
                key={c.code}
                onClick={() => (user ? void switchCurrency(c.code) : openGate("Log in to switch currency accounts."))}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                  active ? "border-brand-gold bg-brand-gold/10" : "border-[#26314a] bg-[#0b1020] hover:border-[#3a4a6d]"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-black text-white">
                  {c.flag} {c.code} {active ? "●" : ""}
                </span>
                <span className="tabular block text-[11px] font-bold text-brand-gold">{money(w?.balance ?? 0, c.code)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl border border-[#1e2739] bg-[#0b1020] p-1">
        {(
          [
            ["deposit", "Deposit"],
            ["withdraw", "Withdraw"],
            ["history", "Transactions"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg py-2 text-xs font-black uppercase tracking-wider transition ${
              tab === k ? "bg-brand-red text-white" : "text-mist hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice ? (
        <p
          className={`mb-4 rounded-xl border px-3 py-2.5 text-xs font-semibold leading-relaxed ${
            notice.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-950/45 text-emerald-200"
              : "border-rose-500/40 bg-rose-950/45 text-rose-200"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* -------------------------------------------------- DEPOSIT PANEL */}
        {tab === "deposit" ? (
          <form onSubmit={startDeposit} className="panel p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="2.5" />
                  <path d="M11 18h2" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <p className="font-display text-base font-black text-white">Mobile money deposit</p>
                <p className="text-[11px] text-mist">An STK push is sent to your phone — confirm with your PIN.</p>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {QUICK_DEPOSIT.map((q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => setAmount(q)}
                  className={`tabular rounded-lg border py-2 text-xs font-bold transition ${
                    amount === q
                      ? "border-emerald-500/60 bg-emerald-500/12 text-white"
                      : "border-[#26314a] bg-[#0b1020] text-mist hover:text-white"
                  }`}
                >
                  {q.toLocaleString()}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount (KES)">
                <input
                  type="number"
                  min={50}
                  max={500000}
                  className="input tabular text-lg font-black"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                />
              </Field>
              <Field label="Mobile money number">
                <input
                  className="input tabular"
                  inputMode="tel"
                  placeholder="0712 345 678"
                  value={depPhone}
                  onChange={(e) => setDepPhone(e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="mt-3">
              <p className="label mb-1.5">Channel</p>
              <div className="grid grid-cols-2 gap-2">
                {DEP_METHODS.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setDepMethod(m)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-black transition ${
                      depMethod === m
                        ? "border-emerald-500/60 bg-emerald-500/10 text-white"
                        : "border-[#26314a] bg-[#0b1020] text-mist hover:text-white"
                    }`}
                  >
                    {m}
                    <span className={depMethod === m ? "text-emerald-400" : "text-transparent"}>●</span>
                  </button>
                ))}
              </div>
            </div>

            <button disabled={depBusy || dep?.status === "pending"} className="btn btn-bet mt-4 h-13 w-full py-3.5 text-sm uppercase">
              {depBusy
                ? "Sending STK push…"
                : dep?.status === "pending"
                  ? "Waiting for your PIN…"
                  : `Deposit ${kes(amount, 0)} KES`}
            </button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-mist">
              Funds land in your wallet the moment the payment is confirmed, and you can start flying immediately.
            </p>
          </form>
        ) : null}

        {/* ------------------------------------------------- WITHDRAW PANEL */}
        {tab === "withdraw" ? (
          <form onSubmit={submitWithdrawal} className="panel p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-gold/15 text-brand-gold">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 19V5M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <p className="font-display text-base font-black text-white">Cash out your winnings</p>
                <p className="text-[11px] text-mist">Minimum KES 100 · processed by the payments desk.</p>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              {(
                [
                  ["MPESA", "M-Pesa"],
                  ["VISA", "Visa credit card"],
                ] as const
              ).map(([k, label]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setWdMethod(k)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-black transition ${
                    wdMethod === k
                      ? "border-brand-gold/60 bg-brand-gold/10 text-white"
                      : "border-[#26314a] bg-[#0b1020] text-mist hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <Field label="Amount to withdraw (KES)">
              <input
                type="number"
                min={100}
                max={Math.max(100, Math.floor(user?.balance ?? 0))}
                className="input tabular mb-3 text-lg font-black"
                value={wdAmount}
                onChange={(e) => setWdAmount(Number(e.target.value))}
                required
              />
            </Field>

            {wdMethod === "MPESA" ? (
              <div className="grid gap-3">
                <Field label="Full name (as registered with Safaricom)">
                  <input
                    className="input"
                    value={mpesa.fullName}
                    onChange={(e) => setMpesa((m) => ({ ...m, fullName: e.target.value }))}
                    placeholder="Jane Wanjiru"
                    required
                  />
                </Field>
                <Field label="M-Pesa phone number">
                  <input
                    className="input tabular"
                    inputMode="tel"
                    value={mpesa.phone}
                    onChange={(e) => setMpesa((m) => ({ ...m, phone: e.target.value }))}
                    placeholder="0712 345 678"
                    required
                  />
                </Field>
                <Field label="National ID / Passport (optional)" hint="Speeds up verification for payouts above KES 50,000.">
                  <input
                    className="input tabular"
                    value={mpesa.idNumber}
                    onChange={(e) => setMpesa((m) => ({ ...m, idNumber: e.target.value }))}
                    placeholder="12345678"
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="relative overflow-hidden rounded-2xl border border-[#2b3652] bg-gradient-to-br from-[#1b2436] via-[#131a29] to-[#0b1020] p-4">
                  <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-brand-blue/20 blur-2xl" />
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-mist">Card details</p>
                  <p className="tabular mt-3 text-lg font-black tracking-[0.18em] text-white">
                    {card.cardNumber || "•••• •••• •••• ••••"}
                  </p>
                  <div className="mt-3 flex items-end justify-between text-[11px]">
                    <div>
                      <p className="text-mist">CARD HOLDER</p>
                      <p className="font-bold uppercase text-white">{card.cardName || "YOUR NAME"}</p>
                    </div>
                    <div>
                      <p className="text-mist">EXPIRES</p>
                      <p className="tabular font-bold text-white">{card.expiry || "MM/YY"}</p>
                    </div>
                    <div className="font-display text-sm font-black text-brand-gold">
                      {digitsOnly(card.cardNumber).startsWith("4")
                        ? "VISA"
                        : /^5[1-5]/.test(digitsOnly(card.cardNumber))
                          ? "MASTERCARD"
                          : "CARD"}
                    </div>
                  </div>
                </div>

                <Field label="Name on card">
                  <input
                    className="input uppercase"
                    value={card.cardName}
                    onChange={(e) => setCard((c) => ({ ...c, cardName: e.target.value }))}
                    placeholder="JANE W WANJIRU"
                    required
                  />
                </Field>
                <Field label="Card number">
                  <input
                    className="input tabular tracking-[0.15em]"
                    inputMode="numeric"
                    value={card.cardNumber}
                    onChange={(e) => setCard((c) => ({ ...c, cardNumber: formatCard(e.target.value) }))}
                    placeholder="4111 1111 1111 1111"
                    required
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Expiry (MM/YY)">
                    <input
                      className="input tabular"
                      inputMode="numeric"
                      value={card.expiry}
                      onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))}
                      placeholder="09/28"
                      required
                    />
                  </Field>
                  <Field label="CVV">
                    <input
                      className="input tabular"
                      inputMode="numeric"
                      type="password"
                      maxLength={4}
                      value={card.cvv}
                      onChange={(e) => setCard((c) => ({ ...c, cvv: digitsOnly(e.target.value).slice(0, 4) }))}
                      placeholder="123"
                      required
                    />
                  </Field>
                </div>
                <Field label="Issuing bank (optional)">
                  <input
                    className="input"
                    value={card.bank}
                    onChange={(e) => setCard((c) => ({ ...c, bank: e.target.value }))}
                    placeholder="Equity Bank"
                  />
                </Field>
              </div>
            )}

            <button disabled={wdBusy} className="btn btn-red mt-4 h-12 w-full text-sm uppercase">
              {wdBusy ? "Submitting request…" : `Request ${kes(wdAmount)} payout`}
            </button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-mist">
              Your details are transmitted securely to our payments desk for processing. The requested amount is held
              until the payout is released.
            </p>
            {wdDone ? (
              <p className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-center text-[11px] font-bold text-emerald-300">
                Request {wdDone} received — keep this reference for support.
              </p>
            ) : null}
          </form>
        ) : null}

        {/* -------------------------------------------------- SIDE / HISTORY */}
        <div className="panel p-4">
          {dep ? (
            <div className="mb-4">
              <p className="label mb-2">Deposit status</p>
              <div
                className={`rounded-xl border p-3 ${
                  dep.status === "completed"
                    ? "border-emerald-500/45 bg-emerald-950/40"
                    : dep.status === "failed"
                      ? "border-rose-500/45 bg-rose-950/40"
                      : "border-sky-500/40 bg-sky-950/35"
                }`}
              >
                <div className="flex items-center gap-2">
                  {dep.status === "pending" ? (
                    <span className="h-3 w-3 animate-blink rounded-full bg-sky-400" />
                  ) : dep.status === "completed" ? (
                    <span className="text-emerald-400">✔</span>
                  ) : (
                    <span className="text-rose-400">✕</span>
                  )}
                  <p className="text-sm font-black text-white">
                    {dep.status === "pending"
                      ? "Check your phone"
                      : dep.status === "completed"
                        ? "Payment confirmed"
                        : "Payment not completed"}
                  </p>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                  {dep.status === "pending"
                    ? `We sent an STK push for ${kes(dep.amount)} KES to ${dep.phone}. Enter your mobile money PIN on your handset to complete the deposit.`
                    : dep.status === "completed"
                      ? `${kes(dep.amount)} KES has been added to your wallet. Good luck on the next flight!`
                      : "The request was cancelled or timed out. No money was taken from your phone."}
                </p>
                {dep.status === "pending" ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-1/3 animate-[tickerScroll_1.4s_linear_infinite] rounded-full bg-sky-400" />
                  </div>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => pollDeposit(dep.reference)}
                    className="btn btn-ghost h-8 flex-1 text-[11px] uppercase"
                  >
                    Re-check status
                  </button>
                  {dep.status !== "pending" ? (
                    <button type="button" onClick={() => setDep(null)} className="btn btn-ghost h-8 flex-1 text-[11px] uppercase">
                      Dismiss
                    </button>
                  ) : null}
                </div>
                <p className="tabular mt-2 text-[10px] text-mist">Reference {dep.reference}</p>
              </div>
            </div>
          ) : null}

          <p className="label mb-2">{tab === "history" ? "Transaction history" : "Recent activity"}</p>
          <div className="scroll-thin max-h-[560px] overflow-auto">
            {txs.length === 0 ? (
              <p className="py-6 text-center text-xs text-mist">No transactions yet.</p>
            ) : (
              <div className="grid gap-1.5">
                {txs.slice(0, tab === "history" ? 60 : 10).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#1e2739] bg-[#0b1020] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold capitalize text-white">
                        {t.type} <span className="text-mist">· {t.method ?? ""}</span>
                      </p>
                      <p className="truncate text-[10px] text-mist">
                        {t.reference ?? ""} · {timeAgo(t.createdAt)}
                      </p>
                      {t.note ? <p className="truncate text-[10px] text-slate-500">{t.note}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`tabular text-sm font-black ${t.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {t.amount >= 0 ? "+" : ""}
                        {kes(t.amount)}
                      </p>
                      <span
                        className={`chip border text-[9px] ${
                          t.status === "completed"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : t.status === "pending"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Gate>
      <Suspense fallback={null}>
        <WalletInner />
      </Suspense>
    </Gate>
  );
}
