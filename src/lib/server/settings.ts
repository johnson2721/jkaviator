import "server-only";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export type SiteSettings = {
  siteName: string;
  tagline: string;
  defaultCurrency: string;
  enabledCurrencies: string[];
  welcomeBonusKes: number;
  minBetKes: number;
  maxBetKes: number;
  maxAccumLegs: number;
  oddsMarginPct: number;
  aviatorHouseEdgePct: number;
  casinoHouseEdgePct: number;
  maintenance: boolean;
  supportPhone: string;
  supportEmail: string;
  accent: string;
  allowRegistration: boolean;
};

export const DEFAULTS: SiteSettings = {
  siteName: "KellyBets",
  tagline: "Bet. Play. Win.",
  defaultCurrency: "KES",
  enabledCurrencies: ["KES", "UGX", "TZS", "NGN", "GHS", "ZAR", "USD", "EUR", "GBP", "INR", "BRL", "AED", "USDT", "BTC", "ETH"],
  welcomeBonusKes: 500,
  minBetKes: 10,
  maxBetKes: 100000,
  maxAccumLegs: 20,
  oddsMarginPct: 5,
  aviatorHouseEdgePct: 3,
  casinoHouseEdgePct: 3,
  maintenance: false,
  supportPhone: "+254 700 000 000",
  supportEmail: "support@kellybets.com",
  accent: "#e50539",
  allowRegistration: true,
};

type Cache = { at: number; data: SiteSettings };
const g = globalThis as typeof globalThis & { __kbSettings?: Cache };
const TTL = 5000;

function coerce(key: keyof SiteSettings, raw: string): SiteSettings[keyof SiteSettings] {
  const def = DEFAULTS[key];
  if (typeof def === "boolean") return (raw === "true" || raw === "1") as never;
  if (typeof def === "number") return (Number.isFinite(Number(raw)) ? Number(raw) : def) as never;
  if (Array.isArray(def)) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return (Array.isArray(parsed) && parsed.length ? parsed : def) as never;
    } catch {
      return (raw.split(",").map((s) => s.trim()).filter(Boolean) || def) as never;
    }
  }
  return (raw || def) as never;
}

export async function getSettings(): Promise<SiteSettings> {
  const now = Date.now();
  if (g.__kbSettings && now - g.__kbSettings.at < TTL) return g.__kbSettings.data;
  const out: SiteSettings = { ...DEFAULTS };
  try {
    const rows = await db.select().from(siteSettings);
    for (const row of rows) {
      if (row.key in DEFAULTS) {
        (out as Record<string, unknown>)[row.key] = coerce(row.key as keyof SiteSettings, row.value);
      }
    }
  } catch (err) {
    console.error("[settings] load failed", err);
  }
  g.__kbSettings = { at: now, data: out };
  return out;
}

export async function updateSettings(patch: Partial<Record<keyof SiteSettings, unknown>>): Promise<SiteSettings> {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULTS)) continue;
    const serialised = Array.isArray(value) ? JSON.stringify(value) : String(value);
    await db
      .insert(siteSettings)
      .values({ key, value: serialised })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: serialised, updatedAt: new Date() } });
  }
  g.__kbSettings = undefined;
  return getSettings();
}

export function invalidateSettings() {
  g.__kbSettings = undefined;
}

/** Public-safe subset: never includes operator-only fields. */
export function publicSettings(s: SiteSettings) {
  return {
    siteName: s.siteName,
    tagline: s.tagline,
    defaultCurrency: s.defaultCurrency,
    enabledCurrencies: s.enabledCurrencies,
    welcomeBonus: s.welcomeBonusKes,
    minBetKes: s.minBetKes,
    maxBetKes: s.maxAccumLegs ? s.maxBetKes : s.maxBetKes,
    maxAccumLegs: s.maxAccumLegs,
    maintenance: s.maintenance,
    allowRegistration: s.allowRegistration,
    supportPhone: s.supportPhone,
    supportEmail: s.supportEmail,
    accent: s.accent,
  };
}
