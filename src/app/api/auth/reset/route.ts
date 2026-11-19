import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/server/crypto";
import { isValidEmail, normalizePhone, passwordIssues } from "@/lib/server/phone";
import { verifyOtpCode } from "@/lib/server/otp";
import { createSession, isSecureRequest, setSessionCookie, toPublicUser } from "@/lib/server/session";
import { eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw = String(body.identifier ?? body.phone ?? "").trim();
  const phone = raw.includes("@") ? null : normalizePhone(raw);
  const email = raw.includes("@") && isValidEmail(raw) ? raw.toLowerCase() : null;
  const code = String(body.code ?? "").trim();
  const newPassword = String(body.password ?? "");

  if (!phone && !email) return Response.json({ error: "Enter your phone number or email." }, { status: 400 });
  if (!/^\d{6}$/.test(code)) return Response.json({ error: "Enter the 6-digit code from the SMS." }, { status: 400 });
  const issues = passwordIssues(newPassword);
  if (issues.length) return Response.json({ error: `Password must have ${issues.join(", ")}.` }, { status: 400 });

  const found = await db
    .select()
    .from(users)
    .where(phone ? or(eq(users.phone, phone), eq(users.email, email ?? "__none__")) : eq(users.email, email!))
    .limit(1);
  const user = found[0];
  if (!user || user.role === "admin") {
    return Response.json({ error: "We could not reset that account. Check the details and try again." }, { status: 404 });
  }

  const check = await verifyOtpCode(user.phone, code, "reset");
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status });

  const [updated] = await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword), status: user.status === "pending" ? "active" : user.status })
    .where(eq(users.id, user.id))
    .returning();

  if (updated.status === "blocked") {
    return Response.json({ error: "This account is blocked. Contact support." }, { status: 403 });
  }

  const token = await createSession(updated.id, req.headers.get("user-agent"));
  await setSessionCookie(token, isSecureRequest(req));
  return Response.json({ ok: true, token, user: toPublicUser(updated) });
}
