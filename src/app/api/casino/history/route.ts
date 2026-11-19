import { casinoHistory } from "@/lib/server/casino";
import { requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  return Response.json({ history: await casinoHistory(auth.user.id, 60) });
}
