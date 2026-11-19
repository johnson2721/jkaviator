/** Shared, client-safe game tuning constants (no secrets here). */
export const GAME = {
  BETTING_MS: 9000,
  CRASH_HOLD_MS: 3200,
  GROWTH: 0.00011, // exponential growth per millisecond
  HOUSE_EDGE: 0.03,
  MIN_BET: 10,
  MAX_BET: 100000,
  MAX_AUTO_CASHOUT: 200,
  MAX_MULTIPLIER: 200,
  TICK_MS: 80,
} as const;

/** Raw multiplier `t` milliseconds after take-off. */
export function multiplierAt(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1;
  return Math.exp(GAME.GROWTH * elapsedMs);
}

/** Multiplier rounded down to 2 decimals like the real game display. */
export function displayMultiplier(elapsedMs: number): number {
  return Math.max(1, Math.floor(multiplierAt(elapsedMs) * 100) / 100);
}

export function money(value: number): number {
  return Math.floor(value * 100) / 100;
}

export type Phase = "waiting" | "flying" | "crashed";

export function formatKES(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
