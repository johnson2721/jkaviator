"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import { useToast } from "@/components/providers/AppProviders";
import { api, errorMessage } from "@/lib/api";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { push } = useToast();
  const [form, setForm] = useState({
    name: "",
    email: params.get("email") ?? "",
    phone: params.get("phone") ?? "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await api<{ ok?: boolean; phone?: string; devCode?: string; error?: string }>(
      "/api/auth/register",
      { method: "POST", json: form },
    );
    setBusy(false);
    if (!res.ok) {
      setError(errorMessage(res.data, "Registration failed."));
      return;
    }
    sessionStorage.setItem(
      "av-otp",
      JSON.stringify({
        phone: res.data.phone ?? form.phone,
        identifier: res.data.phone ?? form.phone,
        code: res.data.devCode ?? null,
        resendAt: Date.now() + 20_000,
        mode: "register",
      }),
    );
    push("Verification code sent to your phone by SMS.", "success");
    router.push("/verify");
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="We'll text a 6-digit code to confirm your number before you can play."
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-bold text-brand-blue hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3">
        <div>
          <label className="label mb-1 block" htmlFor="name">
            Full name
          </label>
          <input id="name" className="input" placeholder="Jane Wanjiru" value={form.name} onChange={set("name")} required />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            className="input"
            type="email"
            placeholder="jane@example.com"
            value={form.email}
            onChange={set("email")}
            required
          />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="phone">
            Phone number (SMS code will be sent here)
          </label>
          <input
            id="phone"
            className="input"
            inputMode="tel"
            placeholder="0712 345 678"
            value={form.phone}
            onChange={set("phone")}
            required
          />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            placeholder="Minimum 6 characters"
            value={form.password}
            onChange={set("password")}
            required
          />
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy} className="btn btn-bet mt-1 h-12 w-full text-sm uppercase">
          {busy ? "Sending code…" : "Send verification code"}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-mist">
          By registering you confirm you are 18+ and accept the betting rules. Your details are encrypted and never
          shared.
        </p>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-mist">Loading…</div>}>
      <RegisterForm />
    </Suspense>
  );
}
