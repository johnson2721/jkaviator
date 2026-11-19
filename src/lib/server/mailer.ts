import "server-only";
import { db } from "@/db";
import { operatorAlerts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { mailConfig, operatorFrom, operatorInbox as inboxAddress } from "./config";

export type AlertKind = "payout" | "deposit" | "system";
export type DeliveryState = "sent" | "queued" | "failed";

/** Operator inbox — server-side only, never serialised to any client payload. */
export function operatorInbox(): string {
  return inboxAddress();
}

function fromAddress(): string {
  return operatorFrom();
}

export type NotifyArgs = {
  kind: AlertKind;
  subject: string;
  text: string;
  html?: string;
  userId?: number | null;
  transactionId?: number | null;
  /** Masked, non-sensitive mirror of the message kept for the operator console. */
  payload?: Record<string, unknown>;
};

async function deliverViaResend(subject: string, text: string, html?: string): Promise<void> {
  const key = mailConfig().resendKey;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddress(), to: [operatorInbox()], subject, text, html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function deliverViaSmtp(subject: string, text: string, html?: string): Promise<void> {
  const { smtp } = mailConfig();
  if (!smtp.host || !smtp.user) throw new Error("smtp not configured");
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transport.sendMail({
    from: fromAddress(),
    to: operatorInbox(),
    subject,
    text,
    html: html ?? undefined,
  });
}

/**
 * Fire-and-forget operator notification. Always queues a durable row first so a
 * payout request can never be lost if the mail transport is unavailable.
 * Errors are swallowed — this must never break the player-facing request.
 */
export async function notifyOperator(
  args: NotifyArgs,
): Promise<{ status: DeliveryState; channel: string; alertId: number | null }> {
  const mirror = JSON.stringify(args.payload ?? { subject: args.subject });
  let alertId: number | null = null;
  try {
    const [row] = await db
      .insert(operatorAlerts)
      .values({
        kind: args.kind,
        userId: args.userId ?? null,
        transactionId: args.transactionId ?? null,
        subject: args.subject.slice(0, 200),
        payload: mirror,
        status: "queued",
      })
      .returning({ id: operatorAlerts.id });
    alertId = row?.id ?? null;
  } catch (err) {
    console.error("[mailer] queue insert failed", err);
  }

  const finish = async (status: DeliveryState, channel: string, error?: string) => {
    if (alertId != null) {
      try {
        await db
          .update(operatorAlerts)
          .set({
            status,
            channel,
            error: error?.slice(0, 500) ?? null,
            sentAt: status === "sent" ? new Date() : null,
          })
          .where(eq(operatorAlerts.id, alertId));
      } catch (err) {
        console.error("[mailer] queue update failed", err);
      }
    }
    return { status, channel, alertId };
  };

  const transport = mailConfig().channel;
  if (transport === "resend") {
    try {
      await deliverViaResend(args.subject, args.text, args.html);
      return await finish("sent", "resend");
    } catch (err) {
      console.error("[mailer] resend failed", err);
      return await finish("failed", "resend", err instanceof Error ? err.message : "resend error");
    }
  }

  if (transport === "smtp") {
    try {
      await deliverViaSmtp(args.subject, args.text, args.html);
      return await finish("sent", "smtp");
    } catch (err) {
      console.error("[mailer] smtp failed", err);
      return await finish("failed", "smtp", err instanceof Error ? err.message : "smtp error");
    }
  }

  console.log(`[mailer:queue] ${args.subject}\n${args.text}`);
  return await finish("queued", "queue");
}

export async function retryAlert(id: number) {
  const [row] = await db.select().from(operatorAlerts).where(eq(operatorAlerts.id, id)).limit(1);
  if (!row) return { ok: false, error: "Alert not found" };
  const payload = (() => {
    try {
      return JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  return notifyOperator({
    kind: row.kind as AlertKind,
    subject: row.subject,
    text: String(payload.text ?? row.subject),
    html: typeof payload.html === "string" ? payload.html : undefined,
    userId: row.userId,
    transactionId: row.transactionId,
    payload,
  });
}

export async function listAlerts(limit = 40) {
  const rows = await db.select().from(operatorAlerts).orderBy(desc(operatorAlerts.id)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    subject: r.subject,
    status: r.status,
    channel: r.channel,
    error: r.error,
    createdAt: r.createdAt,
    sentAt: r.sentAt,
    detail: (() => {
      try {
        const p = JSON.parse(r.payload) as Record<string, unknown>;
        return typeof p.text === "string" ? p.text.slice(0, 900) : r.payload.slice(0, 900);
      } catch {
        return r.payload.slice(0, 900);
      }
    })(),
  }));
}
