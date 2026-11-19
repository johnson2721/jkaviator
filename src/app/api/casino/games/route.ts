import { getSettings } from "@/lib/server/settings";
import {
  GAME_CATEGORIES,
  GAME_META,
  PLINKO_RISKS,
  SLOT_SYMBOLS,
  WHEEL_SEGMENTS_PUBLIC,
  kenoTable,
} from "@/lib/server/casinoMeta";

export const dynamic = "force-dynamic";

/** Public catalogue so guests can browse the casino before signing up. */
export async function GET() {
  const settings = await getSettings();
  return Response.json({
    meta: GAME_META,
    categories: GAME_CATEGORIES,
    wheel: WHEEL_SEGMENTS_PUBLIC,
    symbols: SLOT_SYMBOLS,
    plinkoRisks: PLINKO_RISKS,
    keno: kenoTable(),
    edge: settings.casinoHouseEdgePct,
    minBetKes: settings.minBetKes,
    siteName: settings.siteName,
  });
}
