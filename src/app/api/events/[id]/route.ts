import { ensureFixturesEngine, getEvent } from "@/lib/server/fixtures";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId)) return Response.json({ error: "Invalid event." }, { status: 400 });
  const engine = ensureFixturesEngine();
  await engine.ready;
  const event = await getEvent(eventId);
  if (!event) return Response.json({ error: "Match not found." }, { status: 404 });
  return Response.json({ event });
}
