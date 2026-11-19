"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import { useAuth, useToast } from "@/components/providers/AppProviders";
import { api, errorMessage, setToken, type PublicUser } from "@/lib/api";

type Mode = "password" | "otp" | "forgot";

type LoginResponse = {
  ok?: boolean;
  needsOtp?: boolean;
  mode?: "login" | "register" | "reset";
  phone?: string;
  devCode?: string;
  message?: string;
  token?: string;
  user?: PublicUser;
  unknownAccount?: boolean;
  badPassword?: boolean;
  generic?: boolean;
  error?: string;
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh, setUser } = useAuth();
  const { push } = useToast();

  const [identifier, setIdentifier] = useState(params.get("phone") ?? params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>(params.get("mode") === "forgot" ? "forgot" : "password");
  const [error, setError] = useState<{ text: string; unknown?: boolean } | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const flashed = params.get("msg");
    if (flashed) setHint(decodeURIComponent(flashed));
  }, [params]);

  const gotoOtp = (data: LoginResponse, fallbackMode: "login" | "register" | "reset") => {
    sessionStorage.setItem(
      "av-otp",
      JSON.stringify({
        phone: data.phone ?? identifier,
        identifier,
        code: data.devCode ?? null,
        resendAt: Date.now() + 20_000,
        mode: data.mode ?? fallbackMode,
      }),
    );
    push(data.message ?? "We sent a 6-digit code to your phone.", "info");
    router.push("/verify");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);

    if (mode === "forgot") {
      setBusy(true);
      const res = await api<LoginResponse>("/api/auth/forgot", { method: "POST", json: { identifier } });
      setBusy(false);
      if (!res.ok) {
        setError({ text: errorMessage(res.data, "Could not send the reset code.") });
        return;
      }
      if (res.data.generic) {
        setError({
          text: "If that account exists, a reset code is on its way. Check your phone.",
        });
        return;
      }
      gotoOtp(res.data, "reset");
      return;
    }

    setBusy(true);
    const res = await api<LoginResponse>("/api/auth/login", {
      method: "POST",
      json: mode === "otp" ? { identifier, otp: true } : { identifier, password },
    });
    setBusy(false);

    if (!res.ok) {
      setError({ text: errorMessage(res.data, "Login failed."), unknown: res.data.unknownAccount });
      return;
    }
    if (res.data.needsOtp) {
      gotoOtp(res.data, "login");
      return;
    }
    if (res.data.token) setToken(res.data.token);
    if (res.data.user) setUser(res.data.user);
    await refresh();
    push(`Welcome back, ${res.data.user?.name?.split(" ")[0] ?? "player"}!`, "success");
    router.push(res.data.user?.role === "admin" ? "/admin" : "/");
  };

  return (
    <AuthShell
      title={mode === "forgot" ? "Reset your password" : mode === "otp" ? "Log in with an SMS code" : "Log in to play"}
      subtitle={
        mode === "forgot"
          ? "We'll text a 6-digit code, then you set a new password."
          : mode === "otp"
            ? "No password needed — we'll text you a one-time code."
            : "Use the phone number or email you registered with."
      }
      footer={
        <>
          New here?{" "}
          <Link
            href={`/register${identifier && !identifier.includes("@") ? `?phone=${encodeURIComponent(identifier)}` : ""}`}
            className="font-bold text-brand-blue hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3">
        <div>
          <label className="label mb-1 block" htmlFor="identifier">
            Phone number or email
          </label>
          <input
            id="identifier"
            className="input"
            placeholder="0712 345 678  or  you@email.com"
            inputMode="tel"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>

        {mode === "password" ? (
          <div>
            <label className="label mb-1 block" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                className="input pr-16"
                type={show ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-bold text-mist hover:text-white"
              >
                {show ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>
        ) : null}

        {mode === "otp" ? (
          <p className="rounded-lg border border-sky-500/35 bg-sky-950/40 px-3 py-2 text-xs leading-relaxed text-sky-200">
            We&apos;ll send a one-time code by SMS to the number on your account. The code expires in 5 minutes.
          </p>
        ) : null}

        {hint ? (
          <p className="rounded-lg border border-emerald-500/35 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-200">
            {hint}
          </p>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200">
            <p>{error.text}</p>
            {error.unknown ? (
              <Link
                href={`/register${identifier && !identifier.includes("@") ? `?phone=${encodeURIComponent(identifier)}` : ""}`}
                className="btn btn-bet mt-2 h-9 w-full text-[11px] uppercase"
              >
                Create account with these details
              </Link>
            ) : null}
            {mode === "password" && !error.unknown ? (
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="mt-2 font-bold text-brand-blue hover:underline"
              >
                Reset my password
              </button>
            ) : null}
          </div>
        ) : null}

        <button type="submit" disabled={busy} className="btn btn-bet mt-1 h-12 w-full text-sm uppercase">
          {busy
            ? "Please wait…"
            : mode === "password"
              ? "Log in"
              : mode === "otp"
                ? "Send SMS code"
                : "Send reset code"}
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
          {mode === "password" ? (
            <>
              <button type="button" onClick={() => { setMode("otp"); setError(null); }} className="text-brand-blue hover:underline">
                Log in with an SMS code instead
              </button>
              <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="text-mist hover:text-white">
                Forgot password?
              </button>
            </>
          ) : (
            <button type="button" onClick={() => { setMode("password"); setError(null); }} className="text-brand-blue hover:underline">
              ← Back to password login
            </button>
          )}
        </div>

        <p className="text-center text-[10px] leading-relaxed text-mist">
          Sessions are encrypted and expire automatically. Never share your password or SMS codes with anyone.
        </p>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-mist">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
