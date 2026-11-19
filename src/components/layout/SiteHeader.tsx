"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/currency";
import { useApp, useAuth } from "@/components/providers/AppProviders";

const NAV = [
  { href: "/", label: "Sports" },
  { href: "/live", label: "Live" },
  { href: "/casino", label: "Casino" },
  { href: "/casino/aviator", label: "Aviator" },
  { href: "/casino/blackjack", label: "Games" },
  { href: "/bonus", label: "Promo" },
];

const QUICK = [
  ["/sport/football", "Football"], ["/sport/basketball", "Basketball"], ["/sport/tennis", "Tennis"],
  ["/sport/cricket", "Cricket"], ["/sport/esports", "E-Sports"], ["/casino/plinko", "Plinko"],
  ["/casino/roulette", "Roulette"], ["/casino/slots", "Slots"], ["/casino/mines", "Mines"],
  ["/casino/keno", "Keno"], ["/history", "Results"],
];

export default function SiteHeader() {
  const { settings, currencies, wallets, activeCurrency, switchCurrency, slip, setSlipOpen, openGate } = useApp();
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState<"none" | "user" | "currency">("none");
  const [q, setQ] = useState("");
  const [live, setLive] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu("none");
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api_live().then((n) => {
        if (alive) setLive(n);
      });
    const api_live = async () => {
      const r = await fetch("/api/sports?live=1&limit=1", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      return (d?.counts?.live as number) ?? 0;
    };
    void tick();
    const t = setInterval(tick, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const balance = wallets.find((w) => w.currency === activeCurrency)?.balance ?? user?.balance ?? 0;
  const meta = currencies.find((c) => c.code === activeCurrency);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/casino?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-[90] shadow-[0_2px_10px_rgba(4,20,45,0.35)]" ref={ref}>
      {/* main blue bar */}
      <div style={{ background: "linear-gradient(180deg,#1f7ae0 0%,#0b57c4 60%,#083f92 100%)" }}>
        <div className="mx-auto flex h-14 max-w-[1700px] items-center gap-2 px-2 sm:gap-3 sm:px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-white/15 ring-1 ring-white/30">
              <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden="true">
                <path fill="#fff" d="M6 34c14-2 24-8 31-17l3-4 2 5c2 5 5 9 9 12l4 3-5 2c-6 2-11 6-14 11l-2 4-3-4c-4-6-9-10-16-12l-9-3z" />
              </svg>
            </span>
            <span className="font-display hidden text-lg font-black tracking-tight text-white sm:block">
              {settings.siteName.toUpperCase()}
            </span>
          </Link>

          <nav className="ml-1 hidden items-center gap-0.5 lg:flex">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2.5 py-2 text-[11px] font-black uppercase tracking-wide transition"
                  style={
                    active
                      ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
                      : { color: "rgba(255,255,255,0.82)" }
                  }
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {item.label}
                  {item.label === "Live" && live ? (
                    <span className="ml-1 rounded bg-white/25 px-1 text-[9px] font-black">{live}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <form onSubmit={search} className="relative ml-auto hidden max-w-[240px] flex-1 md:block">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search games, teams…"
              className="h-9 w-full rounded-md border border-white/25 bg-white/15 pl-8 pr-2 text-xs font-bold text-white placeholder:text-white/60 outline-none focus:bg-white/25"
            />
            <svg viewBox="0 0 24 24" className="absolute top-2.5 left-2.5 h-4 w-4 text-white/70" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
          </form>

          <div className="ml-auto flex items-center gap-1.5 md:ml-2">
            <button
              onClick={() => setSlipOpen(true)}
              className="relative grid h-9 w-9 place-items-center rounded-md bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25"
              aria-label="Bet slip"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 5h16M4 12h16M4 19h10" strokeLinecap="round" />
              </svg>
              {slip.length ? (
                <span className="tabular absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#ffd25e] px-1 text-[10px] font-black text-[#2b1a05]">
                  {slip.length}
                </span>
              ) : null}
            </button>

            {user ? (
              <>
                <button
                  onClick={() => setMenu(menu === "currency" ? "none" : "currency")}
                  className="flex h-9 items-center gap-1 rounded-md bg-white px-2 text-xs font-black"
                  style={{ color: "#0b57c4" }}
                >
                  <span>{meta?.flag ?? "🌐"}</span>
                  <span className="tabular">{money(balance, activeCurrency)}</span>
                  <span className="text-[9px] opacity-70">▼</span>
                </button>

                {menu === "currency" ? (
                  <div className="animate-slide-up absolute top-14 right-2 z-[95] w-[min(92vw,320px)] rounded-lg border bg-white p-2 shadow-2xl" style={{ borderColor: "var(--x-line)" }}>
                    <p className="x-sec px-2 py-1">Currency accounts</p>
                    <div className="x-scroll max-h-80 overflow-y-auto">
                      {currencies.map((c) => {
                        const w = wallets.find((x) => x.currency === c.code);
                        return (
                          <button
                            key={c.code}
                            onClick={() => {
                              void switchCurrency(c.code);
                              setMenu("none");
                            }}
                            className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left hover:bg-[#eef2f8]"
                            style={c.code === activeCurrency ? { background: "#eaf3ff" } : undefined}
                          >
                            <span className="flex items-center gap-2">
                              <span>{c.flag}</span>
                              <span>
                                <span className="block text-xs font-black" style={{ color: "var(--x-ink)" }}>{c.code}</span>
                                <span className="block text-[10px] x-muted">{c.name}</span>
                              </span>
                            </span>
                            <span className="tabular text-xs font-black" style={{ color: "#15803d" }}>{money(w?.balance ?? 0, c.code)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <Link href="/wallet" onClick={() => setMenu("none")} className="x-btn x-btn-blue mt-2 h-9 w-full text-xs uppercase">
                      Deposit / withdraw
                    </Link>
                  </div>
                ) : null}

                <div className="relative">
                  <button
                    onClick={() => setMenu(menu === "user" ? "none" : "user")}
                    className="flex h-9 items-center gap-1.5 rounded-md bg-white/15 px-2 ring-1 ring-white/25 hover:bg-white/25"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[11px] font-black" style={{ color: "#0b57c4" }}>
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="hidden max-w-[80px] truncate text-xs font-bold text-white xl:inline">{user.name.split(" ")[0]}</span>
                  </button>
                  {menu === "user" ? (
                    <div className="animate-slide-up absolute right-0 z-[95] mt-1 w-60 rounded-lg border bg-white p-1.5 shadow-2xl" style={{ borderColor: "var(--x-line)" }}>
                      <div className="rounded-md px-3 py-2" style={{ background: "#f4f7fc" }}>
                        <p className="truncate text-sm font-black" style={{ color: "var(--x-ink)" }}>{user.name}</p>
                        <p className="truncate text-[11px] x-muted">{user.phone || user.email}</p>
                        <p className="tabular mt-1 text-xs font-black" style={{ color: "#15803d" }}>
                          {money(balance, activeCurrency)} {activeCurrency}
                        </p>
                      </div>
                      {[["/history", "My bets"], ["/wallet", "Wallet"], ["/bonus", "Bonuses"]].map(([href, label]) => (
                        <Link key={href} href={href} onClick={() => setMenu("none")} className="block rounded-md px-3 py-2 text-sm font-bold hover:bg-[#eef2f8]" style={{ color: "#33415c" }}>
                          {label}
                        </Link>
                      ))}
                      {user.role === "admin" ? (
                        <Link href="/admin" onClick={() => setMenu("none")} className="block rounded-md px-3 py-2 text-sm font-black hover:bg-[#eef2f8]" style={{ color: "#b45309" }}>
                          Operator console
                        </Link>
                      ) : null}
                      <button
                        onClick={async () => {
                          setMenu("none");
                          await logout();
                          router.push("/");
                        }}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm font-bold text-rose-600 hover:bg-[#fff1f3]"
                      >
                        Log out
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className="h-9 rounded-md px-3 pt-2 text-xs font-black uppercase text-white ring-1 ring-white/35 hover:bg-white/15">
                  Log in
                </Link>
                <button onClick={() => openGate("Create a free account and claim your welcome bonus.")} className="x-btn x-btn-gold h-9 px-3 text-xs uppercase">
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* white quick bar */}
      <div className="border-b bg-white" style={{ borderColor: "var(--x-line)" }}>
        <div className="mx-auto flex max-w-[1700px] items-center gap-1 overflow-x-auto px-2 py-1.5 x-scroll sm:px-4">
          <Link href="/live" className="shrink-0 rounded-md px-2 py-1 text-[11px] font-black uppercase text-white" style={{ background: "#c8102e" }}>
            ● Multi-LIVE {live ? `(${live})` : ""}
          </Link>
          {QUICK.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-bold transition"
              style={pathname === href ? { background: "#eaf3ff", color: "#0b57c4" } : { color: "#6b7a90" }}
            >
              {label}
            </Link>
          ))}
          <span className="ml-auto hidden shrink-0 items-center gap-1 pr-1 text-[10px] font-black x-muted sm:flex">
            One wallet for sports &amp; casino
          </span>
        </div>
      </div>

      {/* mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto bg-[#083f92] px-2 py-1.5 x-scroll lg:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-black uppercase"
            style={pathname === item.href ? { background: "rgba(255,255,255,0.22)", color: "#fff" } : { color: "rgba(255,255,255,0.8)" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
