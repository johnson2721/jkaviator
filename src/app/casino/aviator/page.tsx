"use client";

import AviatorGame from "@/components/game/AviatorGame";
import { useApp, useAuth, useToast } from "@/components/providers/AppProviders";
import type { PublicUser } from "@/lib/api";

const GUEST: PublicUser = {
  id: 0,
  name: "Guest",
  email: "",
  phone: "",
  role: "guest",
  status: "guest",
  balance: 0,
  bonusBalance: 0,
  currency: "KES",
  totalStaked: 0,
  totalWon: 0,
  betsCount: 0,
};

export default function AviatorPage() {
  const { user, refresh } = useAuth();
  const { push } = useToast();
  const { activeCurrency } = useApp();
  const player: PublicUser = user ? { ...user, currency: activeCurrency } : GUEST;

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-3 pt-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-lg font-black text-white">✈️ AVIATOR</h1>
          <span className="rounded bg-brand-red/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-brand-red-soft">
            Crash game · up to 200x
          </span>
          <span className="ml-auto text-[11px] text-mist">
            Playing in <span className="font-black text-brand-gold">{activeCurrency}</span>
            {user ? "" : " · log in to stake real money"}
          </span>
        </div>
      </div>
      <AviatorGame user={player} refreshUser={async () => {
        await refresh();
      }} toast={push} />
    </div>
  );
}
