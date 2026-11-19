import { getSessionUser, toPublicUser } from "@/lib/server/session";
import { listWallets } from "@/lib/server/wallet";
import { getSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ user: null }, { status: 200 });
  const [wallets, settings] = await Promise.all([listWallets(user.id), getSettings()]);
  return Response.json({
    user: toPublicUser(user),
    wallets,
    activeCurrency: user.currency,
    enabledCurrencies: settings.enabledCurrencies,
  });
}
