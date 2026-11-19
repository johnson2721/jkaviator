"use client";

import { api, cacheUser, readCachedUser, setToken, type PublicUser } from "@/lib/api";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SportDef } from "@/lib/data/sports";
import { CURRENCIES, type Currency } from "@/lib/currency";

/* ------------------------------------------------------------------ toasts */
type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
type ToastCtx = { push: (text: string, kind?: Toast["kind"]) => void };
const ToastContext = createContext<ToastCtx>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

/* -------------------------------------------------------------- bet slip */
export type SlipLeg = {
  eventId: number;
  sport: string;
  league: string;
  home: string;
  away: string;
  marketKey: string;
  marketName: string;
  selKey: string;
  selName: string;
  line?: number;
  price: number;
};

/* -------------------------------------------------------------------- auth */
export type Wallet = { currency: string; balance: number; bonusBalance: number };
export type PublicSettings = {
  siteName: string;
  tagline: string;
  defaultCurrency: string;
  enabledCurrencies: string[];
  welcomeBonus: number;
  minBetKes: number;
  maxBetKes: number;
  maxAccumLegs: number;
  maintenance: boolean;
  allowRegistration: boolean;
  supportPhone: string;
  supportEmail: string;
  accent: string;
};

type AppCtx = {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<PublicUser | null>;
  logout: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
  applySession: (token?: string | null, user?: PublicUser | null) => void;
  settings: PublicSettings;
  sports: SportDef[];
  currencies: Currency[];
  wallets: Wallet[];
  activeCurrency: string;
  switchCurrency: (code: string) => Promise<void>;
  activeWallet: Wallet | null;
  slip: SlipLeg[];
  addLeg: (leg: SlipLeg) => void;
  removeLeg: (eventId: number, marketKey: string, line?: number) => void;
  clearSlip: () => void;
  slipOpen: boolean;
  setSlipOpen: (v: boolean) => void;
  gateOpen: boolean;
  openGate: (reason?: string) => void;
  closeGate: () => void;
  gateReason: string;
  requireAuth: (reason?: string) => boolean;
};

const DEFAULT_SETTINGS: PublicSettings = {
  siteName: "KellyBets",
  tagline: "Bet. Play. Win.",
  defaultCurrency: "KES",
  enabledCurrencies: ["KES"],
  welcomeBonus: 500,
  minBetKes: 10,
  maxBetKes: 100000,
  maxAccumLegs: 20,
  maintenance: false,
  allowRegistration: true,
  supportPhone: "",
  supportEmail: "",
  accent: "#e50539",
};

const AppContext = createContext<AppCtx>({} as AppCtx);
export const useApp = () => useContext(AppContext);
export const useAuth = () => {
  const ctx = useContext(AppContext);
  return {
    user: ctx.user,
    loading: ctx.loading,
    refresh: ctx.refresh,
    logout: ctx.logout,
    setUser: ctx.setUser,
    applySession: ctx.applySession,
  };
};

export function AppProviders({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_SETTINGS);
  const [sports, setSports] = useState<SportDef[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([CURRENCIES[0]]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [slipOpen, setSlipOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateReason, setGateReason] = useState("Log in to place your bet.");

  const push = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const setUser = useCallback((next: PublicUser | null) => {
    setUserState(next);
    cacheUser(next);
    if (!next) setToken(null);
  }, []);

  const applySession = useCallback(
    (token?: string | null, nextUser?: PublicUser | null) => {
      if (token) setToken(token);
      if (nextUser) {
        setUserState(nextUser);
        cacheUser(nextUser);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    const res = await api<{ user: PublicUser | null; wallets?: Wallet[]; activeCurrency?: string }>(
      "/api/me",
    );
    const next = res.ok ? res.data.user : null;
    setUserState(next);
    cacheUser(next);
    if (!next) setToken(null);
    if (res.data.wallets) setWallets(res.data.wallets);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    const cached = readCachedUser();
    if (cached) setUserState(cached);
    void refresh();
    api<{ settings?: PublicSettings; sports?: SportDef[]; currencies?: Currency[] }>("/api/settings").then(
      (res) => {
        if (!res.ok) return;
        if (res.data.settings) setSettings(res.data.settings);
        if (res.data.sports) setSports(res.data.sports);
        if (res.data.currencies?.length) setCurrencies(res.data.currencies);
        if (res.data.settings?.accent) {
          document.documentElement.style.setProperty("--kb-accent", res.data.settings.accent);
        }
        if (res.data.settings?.siteName) document.title = `${res.data.settings.siteName} — Sportsbook & Casino`;
      },
    );
  }, [refresh]);

  useEffect(() => {
    if (!user) {
      setWallets([]);
      return;
    }
    api<{ wallets?: Wallet[] }>("/api/wallets").then((res) => {
      if (res.ok && res.data.wallets) setWallets(res.data.wallets);
    });
  }, [user, refresh]);

  const activeCurrency = (user?.currency ?? settings.defaultCurrency ?? "KES").toUpperCase();
  const activeWallet = useMemo(
    () => wallets.find((w) => w.currency === activeCurrency) ?? null,
    [wallets, activeCurrency],
  );

  const switchCurrency = useCallback(
    async (code: string) => {
      if (!user) {
        setGateOpen(true);
        setGateReason("Log in to switch currency accounts.");
        return;
      }
      const res = await api<{ ok?: boolean; wallets?: Wallet[]; user?: PublicUser; error?: string }>(
        "/api/wallets",
        { method: "POST", json: { currency: code } },
      );
      if (res.ok) {
        if (res.data.wallets) setWallets(res.data.wallets);
        if (res.data.user) {
          setUserState(res.data.user);
          cacheUser(res.data.user);
        }
        push(`Switched to your ${code} account.`, "success");
      } else {
        push("Could not switch account.", "error");
      }
    },
    [user, push],
  );

  const addLeg = useCallback((leg: SlipLeg) => {
    setSlip((prev) => {
      const filtered = prev.filter(
        (l) => !(l.eventId === leg.eventId && (l.marketKey === leg.marketKey || l.selKey === leg.selKey)),
      );
      const deduped = filtered.filter((l) => l.eventId !== leg.eventId);
      return [...deduped, leg];
    });
    setSlipOpen(true);
  }, []);

  const removeLeg = useCallback((eventId: number, marketKey: string, line?: number) => {
    setSlip((prev) =>
      prev.filter((l) => !(l.eventId === eventId && l.marketKey === marketKey && l.line === line)),
    );
  }, []);

  const clearSlip = useCallback(() => setSlip([]), []);

  const openGate = useCallback((reason?: string) => {
    if (reason) setGateReason(reason);
    setGateOpen(true);
  }, []);
  const closeGate = useCallback(() => setGateOpen(false), []);

  const requireAuth = useCallback(
    (reason = "Log in to place your bet.") => {
      if (user) return true;
      setGateReason(reason);
      setGateOpen(true);
      return false;
    },
    [user],
  );

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setToken(null);
    setUserState(null);
    cacheUser(null);
    setSlip([]);
  }, []);

  const value: AppCtx = {
    user,
    loading,
    refresh,
    logout,
    setUser,
    applySession,
    settings,
    sports,
    currencies,
    wallets,
    activeCurrency,
    switchCurrency,
    activeWallet,
    slip,
    addLeg,
    removeLeg,
    clearSlip,
    slipOpen,
    setSlipOpen,
    gateOpen,
    openGate,
    closeGate,
    gateReason,
    requireAuth,
  };

  return (
    <AppContext.Provider value={value}>
      <ToastContext.Provider value={{ push }}>
        {children}
        <div className="pointer-events-none fixed top-4 right-4 z-[120] flex w-[min(92vw,360px)] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`animate-fly-in pointer-events-auto rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur ${
                t.kind === "success"
                  ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
                  : t.kind === "error"
                    ? "border-rose-500/40 bg-rose-950/90 text-rose-200"
                    : "border-sky-500/40 bg-sky-950/90 text-sky-200"
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </AppContext.Provider>
  );
}
