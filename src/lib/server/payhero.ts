import "server-only";
import { randomUUID } from "node:crypto";
import { payheroConfig } from "./config";

export type PayState = "pending" | "success" | "failed";

export type InitiateResult = {
  ok: boolean;
  gateway: "PAYHERO" | "SANDBOX";
  reference: string;
  gatewayRef?: string | null;
  state: PayState;
  message?: string;
};

export type StatusResult = {
  ok: boolean;
  state: PayState;
  gatewayRef?: string | null;
  amount?: number | null;
  message?: string;
  raw?: unknown;
};

const SANDBOX_DELAY_MS = 12_000;

type SandboxEntry = { reference: string; amount: number; startedAt: number; phone: string };
const sandboxStore = new Map<string, SandboxEntry>();

const cfg = payheroConfig;

/** Basic auth is derived on the server; the token never reaches the browser. */
function authHeader(c: ReturnType<typeof cfg>): string {
  return `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}`;
}

export function gatewayMode(): "PAYHERO" | "SANDBOX" {
  return payheroConfig().live ? "PAYHERO" : "SANDBOX";
}

/** M-Pesa STK push accepts 07XX / +2547XX / 2547XX formats. */
export function toMpesaPhone(input: string): string | null {
  let d = String(input ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("254")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  if (!/^[17]\d{8}$/.test(d)) return null;
  return `254${d}`;
}

export function newReference(prefix = "AV"): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export function publicAppUrl(req: Request): string {
  const configured = (process.env.PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const proto = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

function sandboxInitiate(reference: string, amount: number, phone: string): InitiateResult {
  sandboxStore.set(reference, { reference, amount, startedAt: Date.now(), phone });
  if (sandboxStore.size > 200) {
    const oldest = [...sandboxStore.keys()].slice(0, 50);
    oldest.forEach((k) => sandboxStore.delete(k));
  }
  console.log(`[payhero:sandbox] STK push simulated for ${phone} — ${amount} KES (${reference})`);
  return {
    ok: true,
    gateway: "SANDBOX",
    reference,
    gatewayRef: `SIM-${reference}`,
    state: "pending",
    message: "Simulated STK push queued",
  };
}

function sandboxStatus(reference: string): StatusResult {
  const entry = sandboxStore.get(reference);
  if (!entry) {
    return { ok: false, state: "failed", message: "Unknown reference" };
  }
  const elapsed = Date.now() - entry.startedAt;
  if (elapsed < SANDBOX_DELAY_MS) {
    return { ok: true, state: "pending", amount: entry.amount, message: "Waiting for the customer to confirm" };
  }
  return { ok: true, state: "success", amount: entry.amount, gatewayRef: `SIM-${reference}`, message: "Confirmed" };
}

/** POST /payments — sends the STK push to the customer's handset. */
export async function initiatePayment(args: {
  phone: string;
  amount: number;
  reference: string;
  name?: string;
  callbackUrl?: string;
  provider?: "m-pesa" | "airtel";
}): Promise<InitiateResult> {
  const c = cfg();
  const mpesa = toMpesaPhone(args.phone);
  if (!mpesa) {
    return { ok: false, gateway: gatewayMode(), reference: args.reference, state: "failed", message: "Invalid M-Pesa number" };
  }
  if (!c.live) {
    if (c.fallback && process.env.NODE_ENV !== "production") return sandboxInitiate(args.reference, args.amount, mpesa);
    return { ok: false, gateway: gatewayMode(), reference: args.reference, state: "failed", message: "Deposits are disabled" };
  }

  try {
    const res = await fetch(`${c.base}/payments`, {
      method: "POST",
      headers: { Authorization: authHeader(c), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        amount: Number(args.amount.toFixed(2)),
        phone_number: mpesa,
        channel_id: c.channel,
        provider: args.provider ?? "m-pesa",
        external_reference: args.reference,
        customer_name: (args.name ?? "Customer").slice(0, 60),
        callback_url: args.callbackUrl ?? "",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* non-JSON response */
    }

    if (!res.ok || data.success === false) {
      const message = String(data.message ?? data.error ?? `Gateway responded ${res.status}`);
      console.error("[payhero] initiate failed", res.status, text.slice(0, 400));
      if (c.fallback && process.env.NODE_ENV !== "production") return sandboxInitiate(args.reference, args.amount, mpesa);
      return { ok: false, gateway: "PAYHERO", reference: args.reference, state: "failed", message };
    }

    return {
      ok: true,
      gateway: "PAYHERO",
      reference: args.reference,
      gatewayRef: String(data.reference ?? data.CheckoutRequestID ?? ""),
      state: "pending",
      message: String(data.status ?? "QUEUED"),
    };
  } catch (err) {
    console.error("[payhero] initiate error", err);
    if (c.fallback && process.env.NODE_ENV !== "production") return sandboxInitiate(args.reference, args.amount, mpesa);
    return {
      ok: false,
      gateway: "PAYHERO",
      reference: args.reference,
      state: "failed",
      message: err instanceof Error ? err.message : "Gateway unreachable",
    };
  }
}

/** Normalises every status shape PayHero has used into one state. */
function normaliseState(payload: unknown): { state: PayState; amount?: number; ref?: string; message?: string } {
  const bag = JSON.stringify(payload ?? {}).toLowerCase();
  const pick = (obj: Record<string, unknown>, keys: string[]): string => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
    }
    return "";
  };
  const root = (payload ?? {}) as Record<string, unknown>;
  const tx = (root.transaction ?? root.data ?? root.result ?? {}) as Record<string, unknown>;
  const raw = [
    pick(root, ["state", "transaction_status"]),
    pick(tx, ["state", "status", "transaction_status"]),
    pick(root, ["status"]),
  ]
    .filter(Boolean)
    .join(" ");

  let state: PayState = "pending";
  if (/(success|completed|complete|paid|confirmed|settled)/.test(raw)) state = "success";
  else if (/(fail|failed|cancelled|canceled|rejected|timeout|expired|error)/.test(raw)) state = "failed";
  else if (bag.includes('"success":true') && /(complete|paid|success)/.test(bag)) state = "success";

  const amountRaw = Number(tx.amount ?? root.amount ?? NaN);
  return {
    state,
    amount: Number.isFinite(amountRaw) ? amountRaw : undefined,
    ref: String(tx.reference ?? root.reference ?? root.checkoutrequestid ?? "") || undefined,
    message: String(root.message ?? tx.message ?? "") || undefined,
  };
}

async function queryGateway(c: ReturnType<typeof cfg>, reference: string) {
  const res = await fetch(`${c.base}/transaction-status?reference=${encodeURIComponent(reference)}`, {
    headers: { Authorization: authHeader(c), "Content-Type": "application/json", Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* non-JSON body */
  }
  return { res, data, text };
}

/**
 * GET /transaction-status?reference= — polled by the deposit screen and the webhook.
 * Transient gateway problems are reported as "pending" so a deposit is never
 * written off while the customer may still be entering their PIN.
 */
export async function fetchTransactionStatus(reference: string, altReference?: string | null): Promise<StatusResult> {
  // A simulated charge is always answered locally.
  if (sandboxStore.has(reference)) return sandboxStatus(reference);

  const c = cfg();
  if (!c.live) return sandboxStatus(reference);

  try {
    let { res, data, text } = await queryGateway(c, reference);
    const notFound =
      res.status === 404 || String(data.error_code ?? "").toLowerCase() === "resource_not_found";

    if (notFound && altReference && altReference !== reference) {
      const second = await queryGateway(c, altReference);
      res = second.res;
      data = second.data;
      text = second.text;
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.error("[payhero] status auth rejected", res.status, text.slice(0, 200));
      } else if (res.status !== 404) {
        console.error("[payhero] status failed", res.status, text.slice(0, 300));
      }
      return {
        ok: false,
        state: "pending",
        message: String(data.error_message ?? `Gateway responded ${res.status}`),
        raw: data,
      };
    }

    const n = normaliseState(data);
    return {
      ok: true,
      state: n.state,
      gatewayRef: n.ref ?? null,
      amount: n.amount ?? null,
      message: n.message ?? String(data.error_message ?? ""),
      raw: data,
    };
  } catch (err) {
    console.error("[payhero] status error", err);
    return { ok: false, state: "pending", message: err instanceof Error ? err.message : "Gateway unreachable" };
  }
}

/** PayHero posts the callback here; this maps their webhook payload to our state. */
export function parseCallback(body: unknown): { reference: string; state: PayState; amount?: number } | null {
  const root = (body ?? {}) as Record<string, unknown>;
  const nested = (root.transaction ?? root.data ?? {}) as Record<string, unknown>;
  const reference = String(
    root.external_reference ?? nested.external_reference ?? root.reference ?? nested.reference ?? "",
  );
  if (!reference) return null;
  const n = normaliseState(body);
  return { reference, state: n.state, amount: n.amount };
}
