import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/server/crypto";
import { getAdminName, getAdminPhone, isAdminPassword, isAdminPhone } from "@/lib/server/admin";
import { normalizePhone } from "@/lib/server/phone";
import { createSession, isSecureRequest, setSessionCookie, toPublicUser } from "@/lib/server/session";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; until: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const guard = attempts.get(ip);
  if (guard && guard.until > Date.now() && guard.count >= 6) {
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body.phone ?? ""));
  const password = String(body.password ?? "");

  const ok = isAdminPhone(phone) && isAdminPassword(password);
  if (!ok) {
    const next = { count: (guard?.count ?? 0) + 1, until: Date.now() + 60_000 };
    attempts.set(ip, next);
    return Response.json({ error: "Invalid operator credentials." }, { status: 401 });
  }
  attempts.delete(ip);

  const adminPhone = getAdminPhone();
  let [admin] = await db.select().from(users).where(eq(users.phone, adminPhone)).limit(1);
  if (!admin) {
    [admin] = await db
      .insert(users)
      .values({
        name: getAdminName(),
        email: "operator@aviatorbet.co.ke",
        phone: adminPhone,
        passwordHash: hashPassword(password),
        role: "admin",
        status: "active",
        balance: "0.00",
      })
      .returning();
  } else if (admin.role !== "admin") {
    await db.update(users).set({ role: "admin", status: "active" }).where(eq(users.id, admin.id));
  }

  const token = await createSession(admin.id, req.headers.get("user-agent"));
  await setSessionCookie(token, isSecureRequest(req));
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, admin.id));

  return Response.json({ ok: true, user: toPublicUser(admin) });
}
