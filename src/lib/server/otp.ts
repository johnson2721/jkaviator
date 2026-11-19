import "server-only";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { generateOtp, sha256 } from "./crypto";
import { sendOtpSms, type SmsResult } from "./sms";
import { desc, eq } from "drizzle-orm";

export type OtpPurpose = "register" | "login" | "reset";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 20_000;

export function otpHash(phone: string, code: string) {
  return sha256(`${phone}:${code}`);
}

/** Invalidates previous codes and sends a fresh one. */
export async function issueOtp(phone: string, purpose: OtpPurpose): Promise<SmsResult> {
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.phone, phone));
  const code = generateOtp();
  const delivery = await sendOtpSms(phone, code, purpose);
  await db.insert(otpCodes).values({
    phone,
    codeHash: otpHash(phone, code),
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
  if (!candidate) return { ok: false as const, error: "No active code. Request a new one.", status: 400 };
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
