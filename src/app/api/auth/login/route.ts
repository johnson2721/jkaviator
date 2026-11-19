import { db } from "@/db";
import { pendingRegistrations, users } from "@/db/schema";
import { verifyPassword } from "@/lib/server/crypto";
import { normalizePhone, isValidEmail } from "@/lib/server/phone";
import { issueOtp } from "@/lib/server/otp";
import { createSession, isSecureRequest, setSessionCookie, toPublicUser } from "@/lib/server/session";
import { eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Accepts a Kenyan phone number in any format, or an email address. */
function resolveIdentifier(raw: string): { phone: string | null; email: string | null } {
  const value = String(raw ?? "").trim();
  if (!value) return { phone: null, email: null };
  if (value.includes("@")) return { phone: null, email: isValidEmail(value) ? value.toLowerCase() : null };
  return { phone: normalizePhone(value), email: null };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier ?? body.phone ?? "").trim();
    const password = String(body.password ?? "");
    const wantsOtp = Boolean(body.otp); // "Send me an SMS code instead"

    const { phone, email } = resolveIdentifier(identifier);
    if (!phone && !email) {
      return Response.json(
        { error: "Enter the phone number or email you registered with." },
        { status: 400 },
      );
    }

    const where = phone ? or(eq(users.phone, phone), eq(users.email, email ?? "__none__")) : eq(users.email, email!);
    const found = await db.select().from(users).where(where).limit(1);
    const user = found[0];
    const accountPhone = user?.phone ?? phone;

    if (!accountPhone) {
      return Response.json({ error: "Enter a valid phone number or email." }, { status: 400 });
    }

    /* --------------------------------------------- operator accounts */
    if (user?.role === "admin") {
      return Response.json({ error: "Operator accounts must use the operator console." }, { status: 403 });
    }

    /* --------------------------------- passwordless SMS login (requested) */
    if (wantsOtp) {
      if (!user) {
        return Response.json(
          { error: "No account found for those details.", unknownAccount: true, phone: accountPhone },
          { status: 404 },
        );
      }
      if (user.status === "blocked") {
        return Response.json({ error: "This account is blocked. Contact support." }, { status: 403 });
      }
      const delivery = await issueOtp(accountPhone, "login");
      if (!delivery.ok) return Response.json({ error: "Could not send the SMS. Try again later." }, { status: 502 });
      return Response.json({
        ok: true,
        needsOtp: true,
        mode: "login",
        phone: accountPhone,
        channel: delivery.channel,
        devCode: delivery.demoCode,
      });
    }

    /* ------------------------------------------------- password required */
    if (!password) {
      return Response.json({ error: "Enter your password, or request an SMS code." }, { status: 400 });
    }

    /* ------------------- unfinished registration with a matching password */
    if (!user) {
      const [pending] = await db
        .select()
        .from(pendingRegistrations)
        .where(phone ? eq(pendingRegistrations.phone, phone) : eq(pendingRegistrations.email, email!))
        .limit(1);

      if (pending) {
        if (!verifyPassword(password, pending.passwordHash)) {
          return Response.json({ error: "Incorrect phone number or password.", badPassword: true }, { status: 401 });
        }
        const delivery = await issueOtp(pending.phone, "register");
        if (!delivery.ok) return Response.json({ error: "Could not send the SMS. Try again later." }, { status: 502 });
        return Response.json({
          ok: true,
          needsOtp: true,
          mode: "register",
          phone: pending.phone,
          channel: delivery.channel,
          devCode: delivery.demoCode,
          message: "Your number was never confirmed. Enter the SMS code to finish signing up.",
        });
      }

      return Response.json(
        {
          error: "No account found for those details. Create one to start playing.",
          unknownAccount: true,
          phone: accountPhone,
        },
        { status: 404 },
      );
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return Response.json({ error: "Incorrect phone number or password.", badPassword: true }, { status: 401 });
    }
    if (user.status === "blocked") {
      return Response.json({ error: "This account is blocked. Contact support." }, { status: 403 });
    }
    if (user.status === "pending") {
      const delivery = await issueOtp(user.phone, "login");
      if (!delivery.ok) return Response.json({ error: "Could not send the SMS. Try again later." }, { status: 502 });
      return Response.json({
        ok: true,
        needsOtp: true,
        mode: "login",
        phone: user.phone,
        channel: delivery.channel,
        devCode: delivery.demoCode,
        message: "Confirm your number with the SMS code we just sent.",
      });
    }

    const token = await createSession(user.id, req.headers.get("user-agent"));
    await setSessionCookie(token, isSecureRequest(req));
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return Response.json({ ok: true, token, user: toPublicUser(user) });
  } catch (err) {
    console.error("[login]", err);
    return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
