import { blackjackAction, getBlackjackHand } from "@/lib/server/casino";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  return Response.json({ hand: getBlackjackHand(auth.user.id) });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { action?: string; stake?: number };
  const action = String(body.action ?? "") as "deal" | "hit" | "stand" | "double";
  if (!["deal", "hit", "stand", "double"].includes(action)) {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  try {
    const result = await blackjackAction(auth.user.id, action, { stake: Number(body.stake) });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Action failed." }, { status: 400 });
  }
}
