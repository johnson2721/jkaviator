import { db } from "@/db";
import { pendingRegistrations, users } from "@/db/schema";
import { hashPassword } from "@/lib/server/crypto";
import { isValidEmail, normalizePhone, passwordIssues } from "@/lib/server/phone";
import { issueOtp } from "@/lib/server/otp";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
    const email = String(body.email ?? "").trim().toLowerCase();
    const phoneRaw = String(body.phone ?? "").trim();
    const password = String(body.password ?? "");

    if (name.length < 2 || name.length > 60) {
      return Response.json({ error: "Enter your full name (2-60 characters)." }, { status: 400 });
    }
    if (!isValidEmail(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    const phone = normalizePhone(phoneRaw);
    if (!phone) return Response.json({ error: "Enter a valid phone number, e.g. 0712 345 678." }, { status: 400 });
    const issues = passwordIssues(password);
    if (issues.length) return Response.json({ error: `Password must have ${issues.join(", ")}.` }, { status: 400 });

    const existing = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (existing[0]) {
      if (existing[0].status === "active") {
        return Response.json(
          { error: "That number is already registered. Log in with your password.", alreadyRegistered: true },
          { status: 409 },
        );
      }
      const delivery = await issueOtp(phone, "register");
      return Response.json({
        ok: true,
        phone,
        resumed: true,
        channel: delivery.channel,
        devCode: delivery.demoCode,
      });
    }

    const passwordHash = hashPassword(password);
    await db.delete(pendingRegistrations).where(eq(pendingRegistrations.phone, phone));
    await db.insert(pendingRegistrations).values({ name, email, phone, passwordHash });

    const delivery = await issueOtp(phone, "register");
    if (!delivery.ok) {
      return Response.json({ error: `Could not deliver the SMS (${delivery.error}). Try again.` }, { status: 502 });
    }
    return Response.json({ ok: true, phone, channel: delivery.channel, devCode: delivery.demoCode });
  } catch (err) {
    console.error("[register]", err);
    return Response.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
