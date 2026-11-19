import { ensureEngine } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const engine = ensureEngine();
  await engine.readyPromise;
  return Response.json({ snapshot: engine.snapshot() });
}
