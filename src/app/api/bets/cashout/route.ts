import { ensureEngine } from "@/lib/game/engine";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const betId = Number(body.betId);
  if (!Number.isFinite(betId)) return Response.json({ error: "betId is required." }, { status: 400 });

  try {
    const engine = ensureEngine();
    const result = await engine.cashOut({ id: auth.user.id }, betId);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Cash out failed." }, { status: 400 });
  }
}
