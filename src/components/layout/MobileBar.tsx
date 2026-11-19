"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { money } from "@/lib/currency";
import { useApp, useAuth } from "@/components/providers/AppProviders";

/** 1xBet-mobile style bottom action bar. */
export default function MobileBar() {
  const { slip, setSlipOpen, activeCurrency, activeWallet, openGate } = useApp();
  const { user } = useAuth();
  const pathname = usePathname();
  const balance = activeWallet?.balance ?? user?.balance ?? 0;

  const items = [
    { href: "/", label: "Sports", icon: "⚽" },
    { href: "/live", label: "Live", icon: "🔴" },
    { href: "/casino", label: "Casino", icon: "🎰" },
    { href: "/wallet", label: "Wallet", icon: "👛" },
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-[95] border-t bg-white lg:hidden" style={{ borderColor: "var(--x-line)" }}>
      <div className="grid grid-cols-5">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-black uppercase"
            style={{ color: pathname === it.href ? "#0b57c4" : "#6b7a90" }}
          >
            <span className="text-base leading-none">{it.icon}</span>
            {it.label}
          </Link>
        ))}
        <button
          onClick={() => (user ? setSlipOpen(true) : openGate("Log in to place your bet."))}
          className="relative flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-black uppercase"
          style={{ color: "#b45309" }}
        >
          <span className="text-base leading-none">🎟️</span>
          Slip
          {slip.length ? (
            <span className="tabular absolute top-0.5 right-[16%] grid h-4 min-w-4 place-items-center rounded-full bg-[#c8102e] px-1 text-[9px] font-black text-white">
              {slip.length}
            </span>
          ) : null}
        </button>
      </div>
      <div className="flex items-center justify-between border-t px-3 py-1" style={{ borderColor: "#eef1f6", background: "#f7f9fc" }}>
        <span className="tabular text-[10px] font-bold x-muted">
          Balance <span style={{ color: "#15803d" }}>{money(balance, activeCurrency)}</span> {activeCurrency}
        </span>
        {user ? (
          <Link href="/casino/aviator" className="text-[10px] font-black uppercase" style={{ color: "#c8102e" }}>
            ✈️ Aviator
          </Link>
        ) : (
          <Link href="/login" className="text-[10px] font-black uppercase" style={{ color: "#0b57c4" }}>
            Log in to bet
          </Link>
        )}
      </div>
    </div>
  );
}
