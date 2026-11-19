import { issueOtp, lastOtpAt, OTP_RESEND_COOLDOWN_MS, type OtpPurpose } from "@/lib/server/otp";
import { normalizePhone } from "@/lib/server/phone";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body.phone ?? ""));
  const purpose = (String(body.purpose ?? "login") as OtpPurpose) || "login";
  if (!phone) return Response.json({ error: "Invalid phone number." }, { status: 400 });
  if (!["register", "login", "reset"].includes(purpose)) {
    return Response.json({ error: "Unknown code purpose." }, { status: 400 });
  }

  const last = await lastOtpAt(phone);
  if (last && Date.now() - last.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - last.getTime())) / 1000);
    return Response.json({ error: `Please wait ${wait}s before requesting another code.` }, { status: 429 });
  }

  const delivery = await issueOtp(phone, purpose);
  return Response.json({ ok: true, channel: delivery.channel, devCode: delivery.demoCode });
}
