import { requireUser, toPublicUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { getActiveCurrency, listWallets, setActiveCurrency } from "@/lib/server/wallet";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const settings = await getSettings();
  const wallets = await listWallets(auth.user.id);
  return Response.json({
    wallets,
    active: await getActiveCurrency(auth.user.id),
    enabled: settings.enabledCurrencies,
    user: toPublicUser(auth.user),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const currency = String(body.currency ?? "").toUpperCase();
  try {
    const wallets = await setActiveCurrency(auth.user.id, currency);
    const [fresh] = await db.select().from(users).where(eq(users.id, auth.user.id));
    return Response.json({ ok: true, wallets, active: currency, user: toPublicUser(fresh) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not switch account." }, { status: 400 });
  }
}
