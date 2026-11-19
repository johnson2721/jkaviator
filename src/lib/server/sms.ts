import { generateOtp, sha256 } from "./crypto";
import { smsConfig } from "./config";

export type SmsResult = {
  ok: boolean;
  channel: "at-sms" | "demo";
  /** Only ever populated when no real SMS gateway is configured. */
  demoCode?: string;
  error?: string;
};

function demoInboxPush(phone: string, body: string) {
  const g = globalThis as typeof globalThis & {
    __avDemoInbox?: { phone: string; body: string; at: number }[];
  };
  g.__avDemoInbox = g.__avDemoInbox ?? [];
  g.__avDemoInbox.unshift({ phone, body, at: Date.now() });
  g.__avDemoInbox = g.__avDemoInbox.slice(0, 25);
}

export function readDemoInbox(phone: string) {
  const g = globalThis as typeof globalThis & {
    __avDemoInbox?: { phone: string; body: string; at: number }[];
  };
  return (g.__avDemoInbox ?? []).filter((m) => m.phone === phone).slice(0, 5);
}

/**
 * Sends an SMS through Africa's Talking when AT_USERNAME + AT_API_KEY are set,
 * otherwise falls back to the built-in demo inbox so the OTP flow stays
 * fully functional in preview environments.
 */
export async function sendOtpSms(phone: string, code: string, purpose: string): Promise<SmsResult> {
  const label =
    purpose === "register"
      ? "Verify your AviatorBet account"
      : purpose === "login"
        ? "Your AviatorBet login code"
        : "Your AviatorBet code";
  const body = `${code} is your AviatorBet verification code. ${label}. It expires in 5 minutes. Never share it.`;

  const { username, apiKey, senderId } = smsConfig();

  if (username && apiKey) {
    try {
      const res = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          apiKey,
        },
        body: new URLSearchParams({
          username,
          to: phone,
          message: body,
          from: senderId || "",
        }).toString(),
      });
      if (res.ok) {
        return { ok: true, channel: "at-sms" };
      }
      return { ok: false, channel: "at-sms", error: `gateway responded ${res.status}` };
    } catch (err) {
      return { ok: false, channel: "at-sms", error: err instanceof Error ? err.message : "gateway error" };
    }
  }

  if (process.env.NODE_ENV === "production") {
    return { ok: false, channel: "demo", error: "SMS gateway is not configured" };
  }

  // Demo channel: keep the message in a server-side inbox keyed by phone.
  demoInboxPush(phone, body);
  const debug = smsConfig().debugCodes;
  return { ok: true, channel: "demo", demoCode: debug ? code : undefined };
}

export function otpHash(code: string, phone: string) {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return sha256(`${phone}:${code}:${secret}`);
}

export function newOtp() {
  return generateOtp();
}
