import { listAlerts, retryAlert } from "@/lib/server/mailer";
import { requireAdmin } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  return Response.json({ alerts: await listAlerts(60) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isFinite(id)) return Response.json({ error: "id is required." }, { status: 400 });
  const result = await retryAlert(id);
  return Response.json({ ok: true, ...result });
}
