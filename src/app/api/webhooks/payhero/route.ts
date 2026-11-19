import { settleDeposit } from "@/lib/server/payments";
import { parseCallback } from "@/lib/server/payhero";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PayHero posts the payment result here. Nothing about this endpoint is exposed in the UI. */
export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const parsed = parseCallback(body);
    if (!parsed) {
      console.log("[payhero:callback] unrecognised payload", JSON.stringify(body).slice(0, 300));
      return Response.json({ message: "Callback received" });
    }
    const outcome = await settleDeposit(parsed.reference);
    console.log(`[payhero:callback] ${parsed.reference} -> ${outcome.outcome}`);
    return Response.json({ message: "Callback received", outcome: outcome.outcome });
  } catch (err) {
    console.error("[payhero:callback] error", err);
    return Response.json({ message: "Callback received" });
  }
}

export async function GET() {
  return Response.json({ ok: true, service: "payhero-callback" });
}
