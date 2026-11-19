"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApp, useToast } from "@/components/providers/AppProviders";
import type { PublicUser } from "@/lib/api";

type Res = { ok?: boolean; token?: string; user?: PublicUser; needsOtp?: boolean; mode?: string; phone?: string; devCode?: string; error?: string };

/** In-place login/signup so a guest is never thrown out of the markets they were browsing. */
export default function StakeGate() {
  const { gateOpen, closeGate, gateReason, applySession, refresh, settings, currencies } = useApp();
  const { push } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState(settings.defaultCurrency || "KES");

  if (!gateOpen) return null;

  const login = async (otp = false) => {
    setBusy(true);
    setError(null);
    const res = await api<Res>("/api/auth/login", {
      method: "POST",
      json: otp ? { identifier, otp: true } : { identifier, password },
    });
    setBusy(false);
    if (!res.ok) {
      setError(errorMessage(res.data, "Login failed."));
      return;
    }
    if (res.data.needsOtp) {
      sessionStorage.setItem(
        "av-otp",
        JSON.stringify({ phone: res.data.phone ?? identifier, identifier, code: res.data.devCode ?? null, mode: res.data.mode ?? "login" }),
      );
      closeGate();
      router.push("/verify");
      return;
    }
    applySession(res.data.token, res.data.user);
    await refresh();
    push("Logged in. Your slip is ready.", "success");
    closeGate();
  };

  const register = async () => {
    setBusy(true);
    setError(null);
    const res = await api<Res & { phone?: string; devCode?: string }>("/api/auth/register", {
      method: "POST",
      json: { name, email, phone, password, currency },
    });
    setBusy(false);
    if (!res.ok) {
      setError(errorMessage(res.data, "Registration failed."));
      return;
    }
    sessionStorage.setItem(
      "av-otp",
      JSON.stringify({ phone: res.data.phone ?? phone, identifier: res.data.phone ?? phone, code: res.data.devCode ?? null, mode: "register" }),
    );
    closeGate();
    router.push("/verify");
  };

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center p-3">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={closeGate} />
      <div className="animate-fly-in panel relative w-full max-w-md p-5">
        <button onClick={closeGate} className="absolute top-3 right-3 text-mist hover:text-white">✕</button>
        <p className="text-xs font-black uppercase tracking-widest text-brand-gold">{gateReason}</p>
        <h2 className="font-display mt-1 text-xl font-black text-white">Join {settings.siteName}</h2>

        <div className="mt-3 flex gap-1 rounded-xl border border-[#1e2739] bg-[#0b1020] p-1">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={`flex-1 rounded-lg py-1.5 text-[11px] font-black uppercase ${
                tab === t ? "bg-brand-red text-white" : "text-mist"
              }`}
            >
              {t === "login" ? "Log in" : "Register"}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2.5">
          {tab === "login" ? (
            <>
              <input className="input" placeholder="Phone number or email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button onClick={() => void login(false)} disabled={busy || !identifier || !password} className="btn btn-bet h-11 w-full text-sm uppercase">
                {busy ? "Please wait…" : "Log in"}
              </button>
              <div className="flex justify-between text-[11px] font-bold">
                <button onClick={() => void login(true)} disabled={busy || !identifier} className="text-brand-blue hover:underline">
                  Send me an SMS code instead
                </button>
                <Link href="/login?mode=forgot" onClick={closeGate} className="text-mist hover:text-white">
                  Forgot password?
                </Link>
              </div>
            </>
          ) : (
            <>
              <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="input" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="input" inputMode="tel" placeholder="Phone number (SMS code)" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className="input" type="password" placeholder="Password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div>
                <p className="label mb-1">Account currency</p>
                <div className="flex flex-wrap gap-1">
                  {currencies.slice(0, 10).map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setCurrency(c.code)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                        currency === c.code ? "border-brand-gold bg-brand-gold/15 text-white" : "border-[#26314a] bg-[#0b1020] text-mist"
                      }`}
                    >
                      {c.flag} {c.code}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => void register()} disabled={busy || !name || !email || !phone || password.length < 6} className="btn btn-bet h-11 w-full text-sm uppercase">
                {busy ? "Sending code…" : "Create account & verify"}
              </button>
              <p className="text-center text-[10px] text-mist">
                A 6-digit code is sent by SMS. {settings.welcomeBonus} KES welcome bonus is requested automatically.
              </p>
            </>
          )}

          {error ? (
            <p className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
