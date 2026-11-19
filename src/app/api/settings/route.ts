import { getSettings, publicSettings } from "@/lib/server/settings";
import { ensureFixturesEngine } from "@/lib/server/fixtures";
import { SPORTS } from "@/lib/data/sports";
import { CURRENCIES } from "@/lib/currency";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  ensureFixturesEngine();
  const enabled = new Set(settings.enabledCurrencies.map((c) => c.toUpperCase()));
  return Response.json({
    settings: publicSettings(settings),
    sports: SPORTS,
    currencies: CURRENCIES.filter((c) => enabled.has(c.code)),
  });
}
