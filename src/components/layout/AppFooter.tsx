"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/AppProviders";

export default function AppFooter() {
  const { settings } = useApp();
  return (
    <footer className="mt-6 border-t border-[#141b2a] bg-[#070b13]">
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg font-black text-white">
            {settings.siteName.toUpperCase()}
            <span className="text-brand-red">.</span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-mist">
            {settings.tagline} — sportsbook, live betting, crash games and casino in one wallet.
          </p>
          <p className="mt-2 text-[10px] text-slate-600">18+ only. Play responsibly.</p>
        </div>
        <div>
          <p className="label mb-2">Betting</p>
          <ul className="grid gap-1 text-xs text-mist">
            <li><Link href="/" className="hover:text-white">All matches</Link></li>
            <li><Link href="/live" className="hover:text-white">Live betting</Link></li>
            <li><Link href="/sport/football" className="hover:text-white">Football</Link></li>
            <li><Link href="/history" className="hover:text-white">My bets</Link></li>
          </ul>
        </div>
        <div>
          <p className="label mb-2">Games</p>
          <ul className="grid gap-1 text-xs text-mist">
            <li><Link href="/casino" className="hover:text-white">Casino lobby</Link></li>
            <li><Link href="/casino/aviator" className="hover:text-white">Aviator</Link></li>
            <li><Link href="/casino/plinko" className="hover:text-white">Plinko</Link></li>
            <li><Link href="/casino/roulette" className="hover:text-white">Roulette</Link></li>
            <li><Link href="/casino/blackjack" className="hover:text-white">Blackjack</Link></li>
            <li><Link href="/bonus" className="hover:text-white">Promotions</Link></li>
          </ul>
        </div>
        <div>
          <p className="label mb-2">Help</p>
          <ul className="grid gap-1 text-xs text-mist">
            <li><Link href="/wallet" className="hover:text-white">Deposit &amp; withdraw</Link></li>
            <li><Link href="/login" className="hover:text-white">Log in</Link></li>
            <li><Link href="/register" className="hover:text-white">Create account</Link></li>
            <li>{settings.supportPhone || "24/7 support"}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[#101724] px-4 py-4 text-center text-[10px] text-slate-600">
        Deposits via M-Pesa, Airtel, MTN MoMo, cards and crypto · Payouts approved by the operator desk · Odds settled
        server-side.
      </div>
    </footer>
  );
}
