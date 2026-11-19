import { DEFAULTS, getSettings, updateSettings } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/session";
import { CURRENCIES } from "@/lib/currency";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  return Response.json({ settings: await getSettings(), defaults: DEFAULTS, allCurrencies: CURRENCIES.map((c) => c.code) });
}

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    if (!(key in body)) continue;
    const value = body[key];
    const def = DEFAULTS[key];
    if (typeof def === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      patch[key] = n;
    } else if (typeof def === "boolean") {
      patch[key] = Boolean(value);
    } else if (Array.isArray(def)) {
      if (Array.isArray(value)) patch[key] = value.map((v) => String(v).toUpperCase()).filter(Boolean);
    } else {
      patch[key] = String(value ?? "").slice(0, 200);
    }
  }

  const next = await updateSettings(patch as never);
  return Response.json({ ok: true, settings: next });
}
