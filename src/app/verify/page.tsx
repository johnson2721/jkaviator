"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import { useAuth, useToast } from "@/components/providers/AppProviders";
import { api, errorMessage, setToken, type PublicUser } from "@/lib/api";

type OtpState = { phone: string; identifier?: string; code: string | null; mode: string; resendAt?: number };
type VerifyResponse = { ok?: boolean; token?: string; user?: PublicUser; newUser?: boolean; error?: string };

export default function VerifyPage() {
  const router = useRouter();
  const { refresh, setUser } = useAuth();
  const { push } = useToast();

  const [state, setState] = useState<OtpState | null>(null);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"code" | "password">("code");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("av-otp");
      if (!raw) {
        router.replace("/login");
        return;
      }
      const parsed = JSON.parse(raw) as OtpState;
      setState(parsed);
      setCooldown(Math.max(0, Math.ceil(((parsed.resendAt ?? 0) - Date.now()) / 1000)));
      if (parsed.code) setDigits(parsed.code.split("").slice(0, 6));
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    boxes.current[0]?.focus();
  }, [state?.phone]);

  const setDigit = (i: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      setDigits((d) => d.map((v, idx) => (idx === i ? "" : v)));
      return;
    }
    const next = [...digits];
    clean.split("").forEach((ch, k) => {
      if (i + k < 6) next[i + k] = ch;
    });
    setDigits(next);
    boxes.current[Math.min(5, i + clean.length)]?.focus();
  };

  const code = digits.join("");
  const isReset = state?.mode === "reset";

  const finish = async (data: VerifyResponse, successText: string) => {
    if (data.token) setToken(data.token);
    if (data.user) setUser(data.user);
    await refresh();
    push(successText, "success");
    sessionStorage.removeItem("av-otp");
    router.push(data.user?.role === "admin" ? "/admin" : "/");
  };

  const submit = async () => {
    if (busy || !state || code.length !== 6) return;
    setError(null);
    setBusy(true);

    if (isReset) {
      if (step === "code") {
        setBusy(false);
        setStep("password");
        return;
      }
      if (password.length < 6) {
        setBusy(false);
        setError("Choose a password with at least 6 characters.");
        return;
      }
      if (password !== confirm) {
        setBusy(false);
        setError("The two passwords do not match.");
        return;
      }
      const res = await api<VerifyResponse>("/api/auth/reset", {
        method: "POST",
        json: { identifier: state.identifier ?? state.phone, phone: state.phone, code, password },
      });
      setBusy(false);
      if (!res.ok) {
        setError(errorMessage(res.data, "Could not reset the password."));
        setStep("code");
        return;
      }
      await finish(res.data, "Password updated — you are logged in.");
      return;
    }

    const res = await api<VerifyResponse>("/api/auth/verify-otp", {
      method: "POST",
      json: { phone: state.phone, code },
    });
    setBusy(false);
    if (!res.ok) {
      setError(errorMessage(res.data, "Verification failed."));
      return;
    }
    await finish(res.data, res.data.newUser ? "Account created — welcome to AviatorBet!" : "Phone verified — welcome back!");
  };

  const resend = async () => {
    if (busy || !state || cooldown) return;
    setError(null);
    setBusy(true);
    const res = await api<{ ok?: boolean; devCode?: string; error?: string; retryAfter?: number }>("/api/auth/resend-otp", {
      method: "POST",
      json: { phone: state.phone, purpose: isReset ? "reset" : state.mode === "register" ? "register" : "login" },
    });
    setBusy(false);
    const wait = res.ok ? 20 : res.data.retryAfter ?? 0;
    const next = { ...state, resendAt: Date.now() + wait * 1000, code: res.ok ? res.data.devCode ?? null : state.code };
    setCooldown(wait);
    setState(next);
    sessionStorage.setItem("av-otp", JSON.stringify(next));
    if (!res.ok) {
      setError(errorMessage(res.data, "Could not resend the code."));
      return;
    }
    setStep("code");
    requestAnimationFrame(() => boxes.current[0]?.focus());
    if (res.data.devCode) setDigits(res.data.devCode.split("").slice(0, 6));
    else setDigits(["", "", "", "", "", ""]);
    push("A new code is on its way.", "success");
  };

  const masked = state?.phone ? state.phone.replace(/.(?=.{3})/g, "•") : "your phone";

  return (
    <AuthShell
      title={isReset && step === "password" ? "Choose a new password" : "Enter the SMS code"}
      subtitle={
        isReset && step === "password"
          ? `Code sent to ${masked}. Set a new password to finish.`
          : `We sent a 6-digit verification code to ${masked}.`
      }
    >
      <div className="grid gap-4">
        <div className={`flex justify-between gap-2 ${isReset && step === "password" ? "opacity-40" : ""}`}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                boxes.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                if (e.key === "Enter") void submit();
              }}
              disabled={isReset && step === "password"}
              aria-label={`Code digit ${i + 1} of 6`}
              autoComplete={i === 0 ? "one-time-code" : "off"}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
                if (!pasted) return;
                e.preventDefault();
                setDigit(pasted.length >= 6 ? 0 : i, pasted);
              }}
              inputMode="numeric"
              maxLength={6}
              className="input tabular h-14 w-full text-center text-2xl font-black disabled:cursor-not-allowed"
            />
          ))}
        </div>

        {isReset && step === "password" ? (
          <div className="grid gap-3">
            <div>
              <label className="label mb-1 block">New password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                autoFocus
              />
            </div>
            <div>
              <label className="label mb-1 block">Confirm new password</label>
              <input
                className="input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat the password"
              />
            </div>
          </div>
        ) : null}

        {state?.code && !(isReset && step === "password") ? (
          <div className="rounded-xl border border-sky-500/35 bg-sky-950/45 p-3">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-sky-300">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M2 5.5A2.5 2.5 0 014.5 3h15A2.5 2.5 0 0122 5.5v9a2.5 2.5 0 01-2.5 2.5H8l-5 4v-4H4.5A2.5 2.5 0 012 14.5z" />
              </svg>
              SMS demo inbox
            </p>
            <p className="mt-1 text-xs leading-relaxed text-sky-100/85">
              No SMS gateway is configured in this environment, so the message is delivered to the built-in inbox. Your
              code is{" "}
              <button
                type="button"
                onClick={() => {
                  const c = (state.code ?? "").split("");
                  if (c.length === 6) setDigits(c);
                  boxes.current[5]?.focus();
                }}
                className="tabular rounded-md bg-sky-500/25 px-2 py-0.5 text-sm font-black tracking-[0.3em] text-white hover:bg-sky-500/40"
              >
                {state.code}
              </button>{" "}
              — tap it to autofill. Set AT_USERNAME / AT_API_KEY to deliver real SMS.
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200">
            {error}
          </p>
        ) : null}

        <button
          onClick={() => void submit()}
          disabled={busy || code.length !== 6 || (isReset && step === "password" && (!password || !confirm))}
          className="btn btn-bet h-12 w-full text-sm uppercase"
        >
          {busy
            ? "Please wait…"
            : isReset
              ? step === "code"
                ? "Continue"
                : "Save new password & log in"
              : "Verify & continue"}
        </button>

        <div className="flex items-center justify-between text-xs">
          <button disabled={busy} onClick={() => {
            sessionStorage.removeItem("av-otp");
            router.push(state?.mode === "register" ? "/register" : isReset ? "/login?mode=forgot" : "/login");
          }} className="font-bold text-mist hover:text-white">
            ← Use a different number
          </button>
          <button
            onClick={() => void resend()}
            disabled={busy || cooldown > 0}
            className="font-bold text-brand-blue hover:underline disabled:text-mist disabled:no-underline"
          >
            {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      </div>
    </AuthShell>
  );
}
