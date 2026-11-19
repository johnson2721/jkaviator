import { db } from "@/db";
import { users } from "@/db/schema";
import { isValidEmail, normalizePhone } from "@/lib/server/phone";
import { issueOtp } from "@/lib/server/otp";
import { eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Sends a password-reset code. Responds generically so accounts can't be enumerated. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw = String(body.identifier ?? body.phone ?? "").trim();
  const phone = raw.includes("@") ? null : normalizePhone(raw);
  const email = raw.includes("@") && isValidEmail(raw) ? raw.toLowerCase() : null;

  if (!phone && !email) {
    return Response.json({ error: "Enter the phone number or email on your account." }, { status: 400 });
  }

  const found = await db
    .select()
    .from(users)
    .where(phone ? or(eq(users.phone, phone), eq(users.email, email ?? "__none__")) : eq(users.email, email!))
    .limit(1);

  const target = found[0];
  if (!target || target.role === "admin") {
    return Response.json({ ok: true, generic: true, message: "If that account exists, a reset code is on its way." });
  }

  const delivery = await issueOtp(target.phone, "reset");
  return Response.json({
    ok: true,
    phone: target.phone,
    mode: "reset",
    channel: delivery.channel,
    devCode: delivery.demoCode,
  });
}
