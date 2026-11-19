import { casinoHistory, playCasino, type CasinoGame, WHEEL_SEGMENTS, minesMultiplier, diceMultiplier } from "@/lib/server/casino";
import { GAME_CATEGORIES, GAME_META, PLINKO_RISKS, SLOT_SYMBOLS, kenoPaytable } from "@/lib/server/casinoGames";
import { getSettings } from "@/lib/server/settings";
import { requireUser, toPublicUser } from "@/lib/server/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const GAMES: CasinoGame[] = ["dice", "mines", "wheel", "plinko", "roulette", "slots", "limbo", "hilo", "keno"];

export async function GET() {
  const settings = await getSettings();
  const edge = settings.casinoHouseEdgePct;
  return Response.json({
    games: GAMES,
    meta: GAME_META,
    categories: GAME_CATEGORIES,
    wheel: WHEEL_SEGMENTS,
    edge,
    symbols: SLOT_SYMBOLS,
    plinkoRisks: PLINKO_RISKS,
    kenoPaytable: Array.from({ length: 10 }, (_, i) => ({ picks: i + 1, table: Array.from({ length: i + 2 }, (_, h) => kenoPaytable(i + 1, h)) })),
    sample: {
      dice: diceMultiplier(50, "over", edge),
      mines: minesMultiplier(3, 3, edge),
    },
  });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const game = String(body.game ?? "") as CasinoGame;
  const stake = Number(body.stake);
  const params = (body.params ?? {}) as Record<string, unknown>;
  if (!GAMES.includes(game)) return Response.json({ error: "Unknown game." }, { status: 400 });

  try {
    const result = await playCasino(auth.user.id, game, stake, params);
    const [fresh] = await db.select().from(users).where(eq(users.id, auth.user.id));
    const history = await casinoHistory(auth.user.id, 12);
    return Response.json({ ...result, user: fresh ? toPublicUser(fresh) : undefined, history });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Play failed." }, { status: 400 });
  }
}
