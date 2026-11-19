"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useToast } from "@/components/providers/AppProviders";
import { api, errorMessage, kes, multiplierColor, timeAgo } from "@/lib/api";

type Overview = {
  integrations?: { payments: string; payheroChannel: number | null; mail: string; sms: string };
  live: { roundId: number; phase: string; multiplier: number; online: number };
  stats: Record<string, number>;
  pendingBonuses: {
    id: number;
    type: string;
    code: string | null;
    amount: number;
    message: string | null;
    createdAt: string;
    userId: number;
    userName: string;
    userPhone: string;
    userBalance: number;
  }[];
  pendingWithdrawals: {
    id: number;
    amount: number;
    method: string | null;
    reference: string | null;
    note: string | null;
    details: Record<string, string> | null;
    notifiedAt: string | null;
    createdAt: string;
    userId: number;
    userName: string;
    userPhone: string;
  }[];
  recentBets: {
    id: number;
    amount: number;
    status: string;
    multiplier: number | null;
    payout: number;
    roundId: number;
    placedAt: string;
    userName: string;
    userPhone: string;
  }[];
  recentUsers: {
    id: number;
    name: string;
    phone: string;
    email: string;
    balance: string;
    status: string;
    totalStaked: string;
    betsCount: number;
    createdAt: string;
  }[];
};

/* ------------------------------------------------------------- login view */
function OperatorLogin({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<{ ok?: boolean; error?: string }>("/api/admin/login", {
      method: "POST",
      json: { phone, password },
    });
    setBusy(false);
    if (!res.ok) {
      setError(errorMessage(res.data, "Operator sign-in failed."));
      return;
    }
    onDone();
  };

  return (
    <div className="grid min-h-[80vh] place-items-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-gold/20 text-brand-gold">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 2l8 3.5V11c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5.5z" />
            </svg>
          </span>
          <div>
            <p className="font-display text-lg font-black text-white">Operator console</p>
            <p className="text-[11px] text-mist">Restricted area — staff sign-in only</p>
          </div>
        </div>
        <label className="label mb-1 block">Operator phone</label>
        <input
          className="input mb-3"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="username"
          required
        />
        <label className="label mb-1 block">Operator password</label>
        <input
          className="input mb-3"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error ? (
          <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200">
            {error}
          </p>
        ) : null}
        <button disabled={busy} className="btn h-11 w-full bg-brand-gold text-sm font-black uppercase text-black">
          {busy ? "Authenticating…" : "Sign in"}
        </button>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-mist">
          Credentials are verified on the server and are never exposed to this page.
        </p>
      </form>
    </div>
  );
}

type Alert = {
  id: number;
  kind: string;
  subject: string;
  status: string;
  channel: string | null;
  error: string | null;
  createdAt: string;
  detail: string;
};

/* ----------------------------------------------------------- console view */
function Console() {
  const { logout } = useAuth();
  const { push } = useToast();
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<"queue" | "payouts" | "players" | "activity" | "inbox" | "settings" | "matches">("queue");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [match, setMatch] = useState({ sport: "football", league: "Custom League", home: "", away: "", kickoff: "", margin: 5 });
  const [settleId, setSettleId] = useState("");
  const [settleScore, setSettleScore] = useState({ home: 0, away: 0 });
  const [note, setNote] = useState<Record<string, string>>({});
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [openAlert, setOpenAlert] = useState<number | null>(null);
  const [players, setPlayers] = useState<Overview["recentUsers"]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<Overview>("/api/admin/overview");
    if (!res.ok) return false;
    setData(res.data);
    setPlayers(res.data.recentUsers);
    return true;
  }, []);

  const loadAlerts = useCallback(async () => {
    const res = await api<{ alerts?: Alert[] }>("/api/admin/alerts");
    if (res.ok) setAlerts(res.data.alerts ?? []);
  }, []);

  useEffect(() => {
    if (data && !Object.keys(form).length) {
      setForm({
        siteName: (data as unknown as { settings?: Record<string, unknown> }).settings?.siteName ?? "KellyBets",
      });
    }
    void load();
    void loadAlerts();
    const t = setInterval(() => {
      void load();
      void loadAlerts();
    }, 8000);
    return () => clearInterval(t);
  }, [load, loadAlerts]);

  const act = async (url: string, body: unknown, okMsg: string) => {
    const res = await api<{ ok?: boolean; error?: string }>(url, { method: "POST", json: body });
    if (!res.ok) {
      push(errorMessage(res.data, "Action failed."), "error");
      return;
    }
    push(okMsg, "success");
    await load();
  };

  const searchPlayers = async () => {
    const res = await api<{ users?: Overview["recentUsers"] }>(`/api/admin/users?q=${encodeURIComponent(query)}`);
    if (res.ok) setPlayers(res.data.users ?? []);
  };

  if (!data) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="h-10 w-10 animate-spin-slow rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  const s = data.stats;
  const cards = [
    { label: "Players", value: s.totalUsers, sub: `${s.activeUsers} active`, cls: "text-white" },
    { label: "Balance liabilities", value: `${kes(s.liabilities, 0)} KES`, sub: "held in wallets", cls: "text-brand-gold" },
    { label: "Total staked", value: `${kes(s.staked, 0)} KES`, sub: `${s.bets} bets`, cls: "text-white" },
    { label: "Total paid out", value: `${kes(s.paid, 0)} KES`, sub: `avg crash ${s.avgCrash.toFixed(2)}x`, cls: "text-emerald-400" },
    { label: "Deposits", value: `${kes(s.deposits, 0)} KES`, sub: `${s.rounds} rounds played`, cls: "text-brand-blue" },
    { label: "Withdrawals", value: `${kes(s.withdrawals, 0)} KES`, sub: `${data.pendingWithdrawals.length} pending`, cls: "text-rose-400" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-white">Operator console</h1>
          <p className="text-xs text-mist">
            Live round #{data.live.roundId} · {data.live.phase} ·{" "}
            <span className="text-brand-gold">{data.live.multiplier.toFixed(2)}x</span> · {data.live.online} players
            online
          </p>
          {data.integrations ? (
            <p className="mt-1 text-[11px] text-mist">
              Payments: <span className="font-bold text-emerald-400">{data.integrations.payments}</span>
              {data.integrations.payheroChannel ? ` · channel ${data.integrations.payheroChannel}` : ""} · Operator
              mail: <span className="font-bold text-brand-blue">{data.integrations.mail}</span> · SMS:{" "}
              <span className="font-bold text-white">{data.integrations.sms}</span>
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => void load()} className="btn btn-ghost h-10 px-4 text-xs uppercase">
            Refresh
          </button>
          <button onClick={() => router.push("/")} className="btn btn-blue h-10 px-4 text-xs uppercase">
            Game view
          </button>
          <button
            onClick={async () => {
              await api("/api/admin/logout", { method: "POST" });
              await logout();
              router.push("/admin");
            }}
            className="btn btn-red h-10 px-4 text-xs uppercase"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="panel p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-mist">{c.label}</p>
            <p className={`tabular mt-1 text-lg font-black ${c.cls}`}>{c.value}</p>
            <p className="text-[10px] text-mist">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex gap-1 rounded-xl border border-[#1e2739] bg-[#0b1020] p-1">
        {(
          [
            ["queue", `Bonus queue (${data.pendingBonuses.length})`],
            ["payouts", `Payouts (${data.pendingWithdrawals.length})`],
            ["players", `Players (${players.length})`],
            ["activity", "Live activity"],
            ["inbox", `Operator inbox (${alerts.length})`],
            ["matches", "Matches"],
            ["settings", "Site settings"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg py-2 text-[11px] font-black uppercase tracking-wider ${
              tab === k ? "bg-brand-gold text-black" : "text-mist hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "queue" ? (
        <div className="grid gap-4">
          <section className="panel p-4">
            <h2 className="mb-3 font-display text-base font-black text-white">
              Bonus requests <span className="text-brand-gold">({data.pendingBonuses.length})</span>
            </h2>
            <div className="grid gap-2">
              {data.pendingBonuses.length === 0 ? (
                <p className="py-6 text-center text-xs text-mist">No bonus requests waiting.</p>
              ) : (
                data.pendingBonuses.map((b) => (
                  <div key={b.id} className="rounded-xl border border-[#1e2739] bg-[#0b1020] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-white">
                          {b.userName} <span className="text-mist">· {b.userPhone}</span>
                        </p>
                        <p className="text-[11px] text-mist">
                          {b.type.toUpperCase()} {b.code ? `· ${b.code}` : ""} · requested {kes(b.amount)} KES ·{" "}
                          {timeAgo(b.createdAt)}
                        </p>
                        <p className="text-[11px] text-mist">Wallet balance {kes(b.userBalance)} KES</p>
                        {b.message ? <p className="mt-1 text-[11px] text-slate-400">“{b.message}”</p> : null}
                      </div>
                      <span className="chip border border-amber-500/40 bg-amber-500/10 text-amber-300">pending</span>
                    </div>
                    <input
                      className="input mt-2 h-9 py-1 text-xs"
                      placeholder="Note to player (optional)"
                      value={note[`b${b.id}`] ?? ""}
                      onChange={(e) => setNote((n) => ({ ...n, [`b${b.id}`]: e.target.value }))}
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={busyId === `b${b.id}`}
                        onClick={() => {
                          setBusyId(`b${b.id}`);
                          act(
                            "/api/admin/bonuses",
                            { id: b.id, decision: "approve", note: note[`b${b.id}`] ?? null },
                            `Approved ${kes(b.amount)} KES for ${b.userName}`,
                          ).finally(() => setBusyId(null));
                        }}
                        className="btn btn-primary h-9 flex-1 text-xs uppercase"
                      >
                        Approve & credit
                      </button>
                      <button
                        disabled={busyId === `br${b.id}`}
                        onClick={() => {
                          setBusyId(`br${b.id}`);
                          act(
                            "/api/admin/bonuses",
                            { id: b.id, decision: "reject", note: note[`b${b.id}`] ?? null },
                            "Bonus request rejected.",
                          ).finally(() => setBusyId(null));
                        }}
                        className="btn btn-ghost h-9 flex-1 text-xs uppercase text-rose-300"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      ) : null}

      {tab === "payouts" ? (
        <div className="grid gap-4">
          <section className="panel p-4">
            <h2 className="mb-3 font-display text-base font-black text-white">
              Payout requests <span className="text-brand-gold">({data.pendingWithdrawals.length})</span>
            </h2>
            <p className="mb-3 -mt-2 text-[11px] text-mist">
              Player-submitted payout details are delivered to the operator inbox in the background; masked copies are
              mirrored here. Card numbers are never stored in full.
            </p>
            <div className="grid gap-2">
              {data.pendingWithdrawals.length === 0 ? (
                <p className="py-6 text-center text-xs text-mist">No payouts waiting.</p>
              ) : (
                data.pendingWithdrawals.map((w) => (
                  <div key={w.id} className="rounded-xl border border-[#1e2739] bg-[#0b1020] p-3">
                    <p className="text-sm font-black text-white">
                      {kes(w.amount)} KES · {w.method}
                    </p>
                    <p className="text-[11px] text-mist">
                      {w.userName} · {w.userPhone} · {w.reference} · {timeAgo(w.createdAt)} ·{" "}
                      {w.notifiedAt ? (
                        <span className="text-emerald-400">notified {timeAgo(w.notifiedAt)}</span>
                      ) : (
                        <span className="text-amber-400">notification queued</span>
                      )}
                    </p>
                    {w.details ? (
                      <div className="mt-2 grid gap-1 rounded-lg border border-[#1e2739] bg-[#070b13] px-2.5 py-2">
                        {Object.entries(w.details)
                          .filter(([, v]) => Boolean(v))
                          .map(([k, v]) => (
                            <p key={k} className="text-[11px]">
                              <span className="text-mist capitalize">{k.replace(/([A-Z])/g, " $1")}: </span>
                              <span className="tabular font-bold text-white">{v}</span>
                            </p>
                          ))}
                      </div>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() =>
                          void act(
                            "/api/admin/withdrawals",
                            { id: w.id, decision: "approve", note: "Paid out via mobile money." },
                            `Payout of ${kes(w.amount)} KES marked as paid.`,
                          )
                        }
                        className="btn btn-primary h-9 flex-1 text-xs uppercase"
                      >
                        Mark paid
                      </button>
                      <button
                        onClick={() =>
                          void act(
                            "/api/admin/withdrawals",
                            { id: w.id, decision: "reject", note: "Rejected — funds returned to wallet." },
                            "Withdrawal rejected and refunded.",
                          )
                        }
                        className="btn btn-ghost h-9 flex-1 text-xs uppercase text-rose-300"
                      >
                        Reject & refund
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "players" ? (
        <section className="panel p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              className="input h-10 max-w-xs py-1.5 text-sm"
              placeholder="Search name, phone or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void searchPlayers()}
            />
            <button onClick={() => void searchPlayers()} className="btn btn-blue h-10 px-4 text-xs uppercase">
              Search
            </button>
          </div>
          <div className="scroll-thin max-h-[620px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#0e131f] text-[10px] uppercase tracking-wider text-mist">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-right">Staked</th>
                  <th className="px-3 py-2 text-right">Bets</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Adjust balance</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} className="border-t border-[#141b2a]">
                    <td className="px-3 py-2">
                      <p className="font-bold text-white">{p.name}</p>
                      <p className="text-[10px] text-mist">{p.email}</p>
                    </td>
                    <td className="tabular px-3 py-2 text-slate-300">{p.phone}</td>
                    <td className="tabular px-3 py-2 text-right font-black text-brand-gold">{kes(p.balance)}</td>
                    <td className="tabular px-3 py-2 text-right text-slate-300">{kes(p.totalStaked, 0)}</td>
                    <td className="tabular px-3 py-2 text-right text-slate-300">{p.betsCount}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`chip border ${
                          p.status === "active"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : p.status === "blocked"
                              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          className="input tabular h-8 w-24 py-0.5 text-xs"
                          placeholder="+ / − KES"
                          value={adjust[`u${p.id}`] ?? ""}
                          onChange={(e) => setAdjust((a) => ({ ...a, [`u${p.id}`]: e.target.value }))}
                        />
                        <button
                          onClick={() =>
                            void act(
                              "/api/admin/users",
                              {
                                userId: p.id,
                                action: "adjust",
                                amount: Number(adjust[`u${p.id}`]),
                                note: "Manual operator adjustment",
                              },
                              "Balance updated.",
                            )
                          }
                          className="btn btn-ghost h-8 px-2 text-[10px] uppercase"
                        >
                          Apply
                        </button>
                        <button
                          onClick={() =>
                            void act(
                              "/api/admin/users",
                              { userId: p.id, action: p.status === "blocked" ? "unblock" : "block" },
                              p.status === "blocked" ? "Player unblocked." : "Player blocked.",
                            )
                          }
                          className={`btn h-8 px-2 text-[10px] uppercase ${
                            p.status === "blocked" ? "btn-primary" : "btn-red"
                          }`}
                        >
                          {p.status === "blocked" ? "Unblock" : "Block"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "inbox" ? (
        <section className="panel p-4">
          <h2 className="mb-1 font-display text-base font-black text-white">Operator inbox queue</h2>
          <p className="mb-3 text-[11px] text-mist">
            Every payout and deposit notification is queued here before delivery. Configure RESEND_API_KEY or SMTP_*
            environment variables to send them to the operator mailbox automatically; failed items can be retried.
          </p>
          <div className="grid gap-2">
            {alerts.length === 0 ? (
              <p className="py-6 text-center text-xs text-mist">Nothing queued yet.</p>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="rounded-xl border border-[#1e2739] bg-[#0b1020] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{a.subject}</p>
                      <p className="text-[11px] text-mist">
                        {a.kind} · {timeAgo(a.createdAt)} · channel {a.channel ?? "queue"}
                      </p>
                      {a.error ? <p className="text-[11px] text-rose-400">{a.error}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`chip border ${
                          a.status === "sent"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : a.status === "failed"
                              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {a.status}
                      </span>
                      <button onClick={() => setOpenAlert(openAlert === a.id ? null : a.id)} className="btn btn-ghost h-7 px-2 text-[10px] uppercase">
                        {openAlert === a.id ? "Hide" : "View"}
                      </button>
                      {a.status !== "sent" ? (
                        <button
                          onClick={() =>
                            act("/api/admin/alerts", { id: a.id }, "Delivery retried.").then(() => loadAlerts())
                          }
                          className="btn btn-blue h-7 px-2 text-[10px] uppercase"
                        >
                          Retry
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {openAlert === a.id ? (
                    <pre className="scroll-thin mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-[#1e2739] bg-[#070b13] p-2.5 text-[11px] leading-relaxed text-slate-300">
                      {a.detail}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}


      {tab === "settings" ? <SettingsTab /> : null}

      {tab === "matches" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="panel p-4">
            <h2 className="mb-3 font-display text-base font-black text-white">Create a match</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input" placeholder="Sport key (football, tennis…)" value={match.sport} onChange={(e) => setMatch((m) => ({ ...m, sport: e.target.value }))} />
              <input className="input" placeholder="League" value={match.league} onChange={(e) => setMatch((m) => ({ ...m, league: e.target.value }))} />
              <input className="input" placeholder="Home team" value={match.home} onChange={(e) => setMatch((m) => ({ ...m, home: e.target.value }))} />
              <input className="input" placeholder="Away team" value={match.away} onChange={(e) => setMatch((m) => ({ ...m, away: e.target.value }))} />
              <input className="input" type="datetime-local" value={match.kickoff} onChange={(e) => setMatch((m) => ({ ...m, kickoff: e.target.value }))} />
              <input className="input tabular" type="number" placeholder="Margin %" value={match.margin} onChange={(e) => setMatch((m) => ({ ...m, margin: Number(e.target.value) }))} />
            </div>
            <button
              onClick={() => void act("/api/admin/events", { action: "create", ...match }, "Match created with live odds.")}
              className="btn btn-primary mt-3 h-10 w-full text-xs uppercase"
            >
              Create match
            </button>
          </div>

          <div className="panel p-4">
            <h2 className="mb-3 font-display text-base font-black text-white">Force a result</h2>
            <p className="mb-2 text-[11px] text-mist">
              Enter the match ID, set the final score and settle — every single and accumulator leg on that match is
              paid out or voided automatically.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <input className="input tabular" placeholder="Match ID" value={settleId} onChange={(e) => setSettleId(e.target.value)} />
              <input className="input tabular" type="number" placeholder="Home" value={settleScore.home} onChange={(e) => setSettleScore((s) => ({ ...s, home: Number(e.target.value) }))} />
              <input className="input tabular" type="number" placeholder="Away" value={settleScore.away} onChange={(e) => setSettleScore((s) => ({ ...s, away: Number(e.target.value) }))} />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() =>
                  void act(
                    "/api/admin/events",
                    { action: "settle", eventId: Number(settleId), homeScore: settleScore.home, awayScore: settleScore.away },
                    "Match settled — bets paid out.",
                  )
                }
                className="btn btn-primary h-10 flex-1 text-xs uppercase"
              >
                Settle &amp; pay
              </button>
              <button
                onClick={() => void act("/api/admin/events", { action: "void", eventId: Number(settleId) }, "Match voided — stakes refunded.")}
                className="btn btn-ghost h-10 flex-1 text-xs uppercase text-rose-300"
              >
                Void &amp; refund
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className="panel p-4">
          <h2 className="mb-3 font-display text-base font-black text-white">Live bet feed</h2>
          <div className="scroll-thin max-h-[620px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#0e131f] text-[10px] uppercase tracking-wider text-mist">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Round</th>
                  <th className="px-3 py-2 text-right">Stake</th>
                  <th className="px-3 py-2 text-right">Multiplier</th>
                  <th className="px-3 py-2 text-right">Payout</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentBets.map((b) => (
                  <tr key={b.id} className="border-t border-[#141b2a]">
                    <td className="px-3 py-2">
                      <p className="font-bold text-white">{b.userName}</p>
                      <p className="text-[10px] text-mist">{b.userPhone}</p>
                    </td>
                    <td className="px-3 py-2 text-mist">#{b.roundId}</td>
                    <td className="tabular px-3 py-2 text-right text-slate-200">{kes(b.amount)}</td>
                    <td className="tabular px-3 py-2 text-right">
                      {b.multiplier ? (
                        <span className={`chip border ${multiplierColor(b.multiplier)}`}>{b.multiplier.toFixed(2)}x</span>
                      ) : (
                        <span className="text-mist">—</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-black text-emerald-400">{kes(b.payout)}</td>
                    <td className="px-3 py-2 capitalize text-mist">{b.status}</td>
                    <td className="px-3 py-2 text-right text-mist">{timeAgo(b.placedAt)}</td>
                  </tr>
                ))}
                {data.recentBets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-mist">
                      No bets recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function AdminPage() {
  const { user, loading, refresh } = useAuth();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (user?.role === "admin") setAuthed(true);
  }, [user]);

  if (loading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="h-10 w-10 animate-spin-slow rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  if (!authed && user?.role !== "admin") {
    return (
      <OperatorLogin
        onDone={async () => {
          await refresh();
          setAuthed(true);
        }}
      />
    );
  }

  return <Console />;
}


function SettingsTab() {
  const { push } = useToast();
  const [s, setS] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [allCurrencies, setAll] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await api<{ settings?: Record<string, unknown>; allCurrencies?: string[] }>("/api/admin/settings");
    if (res.ok) {
      setS(res.data.settings ?? {});
      setAll(res.data.allCurrencies ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!s) return <div className="panel p-8 text-center text-xs text-mist">Loading site configuration…</div>;

  const set = (k: string, v: unknown) => setS((prev) => ({ ...(prev ?? {}), [k]: v }));
  const save = async () => {
    setBusy(true);
    const res = await api<{ ok?: boolean; error?: string }>("/api/admin/settings", { method: "PUT", json: s });
    setBusy(false);
    if (!res.ok) {
      push(errorMessage(res.data, "Could not save."), "error");
      return;
    }
    push("Site settings saved — the whole site updates instantly.", "success");
    setTimeout(() => window.location.reload(), 900);
  };

  const text = (k: string, label: string, hint?: string) => (
    <div>
      <label className="label mb-1 block">{label}</label>
      <input className="input" value={String(s[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
      {hint ? <p className="mt-1 text-[10px] text-mist">{hint}</p> : null}
    </div>
  );
  const num = (k: string, label: string) => (
    <div>
      <label className="label mb-1 block">{label}</label>
      <input className="input tabular" type="number" value={Number(s[k] ?? 0)} onChange={(e) => set(k, Number(e.target.value))} />
    </div>
  );
  const bool = (k: string, label: string) => (
    <label className="flex items-center justify-between rounded-xl border border-[#26314a] bg-[#0b1020] px-3 py-2.5">
      <span className="text-sm font-bold text-white">{label}</span>
      <input type="checkbox" className="h-5 w-9 accent-[#16c784]" checked={Boolean(s[k])} onChange={(e) => set(k, e.target.checked)} />
    </label>
  );

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="panel p-4">
        <h2 className="mb-3 font-display text-base font-black text-white">Brand &amp; contact</h2>
        <div className="grid gap-3">
          {text("siteName", "Site name", "Shown in the header, splash screen, browser tab and emails.")}
          {text("tagline", "Tagline")}
          {text("accent", "Accent colour", "Hex colour, e.g. #e50539")}
          {text("supportPhone", "Support phone")}
          {text("supportEmail", "Support email")}
        </div>
      </div>

      <div className="panel p-4">
        <h2 className="mb-3 font-display text-base font-black text-white">Trading &amp; limits</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {num("oddsMarginPct", "Sportsbook margin %")}
          {num("aviatorHouseEdgePct", "Aviator house edge %")}
          {num("casinoHouseEdgePct", "Casino house edge %")}
          {num("welcomeBonusKes", "Welcome bonus (KES)")}
          {num("minBetKes", "Min bet (KES)")}
          {num("maxBetKes", "Max bet (KES)")}
          {num("maxAccumLegs", "Max accumulator legs")}
          <div>
            <label className="label mb-1 block">Default currency</label>
            <select className="input" value={String(s.defaultCurrency ?? "KES")} onChange={(e) => set("defaultCurrency", e.target.value)}>
              {allCurrencies.map((c) => (
                <option key={c} value={c} className="bg-[#0e131f]">{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="label mb-1 block">Enabled currency accounts</label>
          <div className="flex flex-wrap gap-1">
            {allCurrencies.map((c) => {
              const list = (s.enabledCurrencies as string[]) ?? [];
              const on = list.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => set("enabledCurrencies", on ? list.filter((x) => x !== c) : [...list, c])}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${on ? "border-emerald-500/60 bg-emerald-500/12 text-white" : "border-[#26314a] bg-[#0b1020] text-mist"}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="panel p-4 xl:col-span-2">
        <h2 className="mb-3 font-display text-base font-black text-white">Switches</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {bool("maintenance", "Maintenance mode (blocks play)")}
          {bool("allowRegistration", "Allow new registrations")}
        </div>
        <button onClick={() => void save()} disabled={busy} className="btn btn-primary mt-4 h-11 w-full text-sm uppercase">
          {busy ? "Saving…" : "Save & publish site settings"}
        </button>
      </div>
    </section>
  );
}
