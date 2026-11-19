"use client";

import Gate, { PageHeader } from "@/components/auth/Gate";
import { useAuth, useToast } from "@/components/providers/AppProviders";
import { api, errorMessage, kes, timeAgo } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type BonusReq = {
  id: number;
  type: string;
  code: string | null;
  amount: number;
  message: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const PROMOS = [
  {
    code: "WELCOME500",
    title: "Welcome 500 KES",
    body: "Auto-filed the moment your number is verified. The operator desk approves it within minutes.",
    accent: "from-brand-red/30 to-transparent",
  },
  {
    code: "FIRSTFLIGHT",
    title: "100% first deposit",
    body: "Double your first top-up up to 10,000 KES. Request it after depositing and it lands as bonus credit.",
    accent: "from-brand-blue/30 to-transparent",
  },
  {
    code: "CASHBACK10",
    title: "Weekly 10% cashback",
    body: "Lost more than you won this week? Claim 10% of your net losses back every Monday.",
    accent: "from-brand-gold/25 to-transparent",
  },
  {
    code: "FREEBET50",
    title: "Free bet 50 KES",
    body: "Stake 1,000 KES in a week and pick up a 50 KES free flight on the house.",
    accent: "from-emerald-500/25 to-transparent",
  },
];

const TYPES = ["welcome", "deposit", "promo", "cashback", "freebet"];

export default function BonusPage() {
  const { user, refresh } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<BonusReq[]>([]);
  const [form, setForm] = useState({ type: "promo", code: "", amount: 500, message: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ requests?: BonusReq[] }>("/api/bonus");
    if (res.ok) setRows(res.data.requests ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ ok?: boolean; error?: string }>("/api/bonus", { method: "POST", json: form });
    setBusy(false);
    if (!res.ok) {
      push(errorMessage(res.data, "Could not submit the request."), "error");
      return;
    }
    push("Bonus request sent to the operator desk.", "success");
    setForm({ type: "promo", code: "", amount: 500, message: "" });
    void load();
  };

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <Gate>
      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <PageHeader
          title="Bonuses & promotions"
          subtitle="Request a bonus and the operator approves it straight to your wallet."
          right={
            <div className="panel-flat px-4 py-2 text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-mist">Bonuses received</p>
              <p className="tabular text-xl font-black text-emerald-400">{kes(user?.bonusBalance ?? 0)} KES</p>
              <p className="text-[11px] text-mist">{pending} awaiting approval</p>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {PROMOS.map((p) => (
            <div
              key={p.code}
              className={`panel relative overflow-hidden bg-gradient-to-br ${p.accent} p-4`}
            >
              <p className="font-display text-lg font-black text-white">{p.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{p.body}</p>
              <button
                onClick={() => setForm((f) => ({ ...f, code: p.code, type: p.code.startsWith("CASHBACK") ? "cashback" : p.code.startsWith("FREEBET") ? "freebet" : "promo" }))}
                className="btn btn-ghost mt-3 h-9 px-3 text-xs"
              >
                Use code {p.code}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <form onSubmit={submit} className="panel p-4">
            <p className="label mb-3">Request a bonus</p>
            <label className="label mb-1 block">Type</label>
            <select
              className="input mb-3"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              {TYPES.map((t) => (
                <option key={t} value={t} className="bg-[#0e131f]">
                  {t.toUpperCase()}
                </option>
              ))}
            </select>

            <label className="label mb-1 block">Promo code (optional)</label>
            <input
              className="input mb-3 uppercase"
              placeholder="WELCOME500"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            />

            <label className="label mb-1 block">Amount requested (KES)</label>
            <input
              type="number"
              min={50}
              max={50000}
              className="input tabular mb-3"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
              required
            />

            <label className="label mb-1 block">Message to the operator</label>
            <textarea
              className="input mb-3 min-h-[80px] text-sm"
              placeholder="Deposited 2,000 KES today, claiming the first-flight match."
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />

            <button disabled={busy} className="btn btn-bet h-12 w-full text-sm uppercase">
              {busy ? "Sending…" : "Submit request"}
            </button>
          </form>

          <div className="panel p-4">
            <p className="label mb-3">My requests</p>
            <div className="grid gap-2">
              {rows.length === 0 ? (
                <p className="py-8 text-center text-xs text-mist">You have not requested a bonus yet.</p>
              ) : (
                rows.map((r) => (
                  <div key={r.id} className="rounded-xl border border-[#1e2739] bg-[#0b1020] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">
                          {kes(r.amount)} KES · <span className="uppercase text-mist">{r.type}</span>
                        </p>
                        <p className="text-[11px] text-mist">
                          {r.code ? `Code ${r.code} · ` : ""}
                          {timeAgo(r.createdAt)}
                        </p>
                        {r.message ? <p className="mt-1 text-[11px] text-slate-400">“{r.message}”</p> : null}
                        {r.adminNote ? (
                          <p className="mt-1 text-[11px] font-semibold text-brand-gold">Operator: {r.adminNote}</p>
                        ) : null}
                      </div>
                      <span
                        className={`chip shrink-0 border ${
                          r.status === "approved"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : r.status === "pending"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    {r.status === "approved" ? (
                      <button onClick={() => void refresh()} className="mt-2 text-[11px] font-bold text-brand-blue hover:underline">
                        Refresh balance
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Gate>
  );
}
