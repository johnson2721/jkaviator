import "server-only";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { generateOtp } from "./crypto";
import { otpHash as secretHash, sendOtpSms, type SmsResult } from "./sms";
import { desc, eq } from "drizzle-orm";

export type OtpPurpose = "register" | "login" | "reset";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 20_000;

export function otpHash(phone: string, code: string) {
  return secretHash(code, phone);
}

/** Invalidates previous codes and sends a fresh one. */
export async function issueOtp(phone: string, purpose: OtpPurpose): Promise<SmsResult> {
  const code = generateOtp();
  const codeHash = otpHash(phone, code);
  const delivery = await sendOtpSms(phone, code, purpose);
  if (!delivery.ok) return delivery;
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.phone, phone));
  await db.insert(otpCodes).values({
    phone,
    codeHash,
    purpose,
    channel: delivery.channel,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  return delivery;
}

export async function lastOtpAt(phone: string): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(eq(otpCodes.phone, phone))
    .orderBy(desc(otpCodes.id))
    .limit(1);
  return row?.createdAt ?? null;
}

export async function verifyOtpCode(phone: string, code: string, purpose?: OtpPurpose) {
  const rows = await db
    .select()
    .from(otpCodes)
    .where(eq(otpCodes.phone, phone))
    .orderBy(desc(otpCodes.id))
    .limit(5);

  const candidate = rows.find(
    (r) => !r.consumedAt && r.expiresAt.getTime() > Date.now() && (!purpose || r.purpose === purpose),
  );
  if (!candidate) return { ok: false as const, error: "This code has expired or is no longer active. Request a new one.", status: 400 };
  if (candidate.attempts >= 5) {
    return { ok: false as const, error: "Too many attempts. Request a new code.", status: 429 };
  }
  if (otpHash(phone, code) !== candidate.codeHash) {
    await db.update(otpCodes).set({ attempts: candidate.attempts + 1 }).where(eq(otpCodes.id, candidate.id));
    return { ok: false as const, error: "Incorrect code. Check the SMS and try again.", status: 400 };
  }
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, candidate.id));
  return { ok: true as const, purpose: candidate.purpose };
}
