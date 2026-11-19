import { db } from "@/db";
import { bonusRequests, pendingRegistrations, users } from "@/db/schema";
import { normalizePhone } from "@/lib/server/phone";
import { verifyOtpCode } from "@/lib/server/otp";
import { createSession, isSecureRequest, setSessionCookie, toPublicUser } from "@/lib/server/session";
import { eq } from "drizzle-orm";
import { ensureWallets, setActiveCurrency } from "@/lib/server/wallet";
import { getSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(String(body.phone ?? ""));
    const code = String(body.code ?? "").trim();
    if (!phone) return Response.json({ error: "Invalid phone number." }, { status: 400 });
    if (!/^\d{6}$/.test(code)) return Response.json({ error: "Enter the 6-digit code." }, { status: 400 });

    const check = await verifyOtpCode(phone, code);
    if (!check.ok) return Response.json({ error: check.error }, { status: check.status });

    /* ------------------------------ existing account (login / reset flows) */
    const existing = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (existing[0]) {
      const user = existing[0];
      if (user.status === "blocked") {
        return Response.json({ error: "This account is blocked. Contact support." }, { status: 403 });
      }
      if (user.status === "pending") {
        await db.update(users).set({ status: "active" }).where(eq(users.id, user.id));
      }
      await ensureWallets(user.id, user.currency);
      const token = await createSession(user.id, req.headers.get("user-agent"));
      await setSessionCookie(token, isSecureRequest(req));
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      const [fresh] = await db.select().from(users).where(eq(users.id, user.id));
      return Response.json({ ok: true, token, user: toPublicUser(fresh) });
    }

    /* ------------------------------------- brand new account (registration) */
    const [pending] = await db
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.phone, phone))
      .limit(1);
    if (!pending) {
      return Response.json({ error: "Registration expired. Please register again." }, { status: 400 });
    }

    const settings = await getSettings();
    const wanted = String(body.currency ?? "").toUpperCase();
    const chosen = settings.enabledCurrencies.includes(wanted) ? wanted : settings.defaultCurrency;

    const [created] = await db
      .insert(users)
      .values({
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        passwordHash: pending.passwordHash,
        status: "active",
        role: "user",
        currency: chosen,
      })
      .returning();

    await ensureWallets(created.id, chosen);

    await db.delete(pendingRegistrations).where(eq(pendingRegistrations.phone, phone));

    await db.insert(bonusRequests).values({
      userId: created.id,
      type: "welcome",
      code: "WELCOME",
      amount: settings.welcomeBonusKes.toFixed(2),
      message: "New account welcome bonus request (auto-generated).",
      status: "pending",
    });

    const token = await createSession(created.id, req.headers.get("user-agent"));
    await setSessionCookie(token, isSecureRequest(req));
    return Response.json({ ok: true, token, user: toPublicUser(created), newUser: true });
  } catch (err) {
    console.error("[verify-otp]", err);
    return Response.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
