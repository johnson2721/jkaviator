import "server-only";

// Server-only configuration. Credentials have no built-in defaults.
const env = (key: string, fallback = ""): string => {
  const raw = process.env[key];
  if (raw === undefined || raw === null) return fallback;
  const trimmed = String(raw).trim();
  // Treat an explicitly empty value as "not configured" and use the fallback.
  return trimmed === "" ? fallback : trimmed;
};

const flag = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  return String(raw).trim().toLowerCase() !== "false";
};

/* ------------------------------------------------------------------ operator */

export function adminPhoneRaw(): string {
  return env("ADMIN_PHONE");
}
export function adminPassword(): string {
  return env("ADMIN_PASSWORD");
}
export function adminName(): string {
  return env("ADMIN_NAME", "Operator");
}
export function operatorInbox(): string {
  return env("OPS_NOTIFY_EMAIL");
}
export function operatorFrom(): string {
  return env("OPS_NOTIFY_FROM", "AviatorBet Payments <payments@aviatorbet.co.ke>");
}

/* -------------------------------------------------------------------- PayHero */
export type PayheroConfig = {
  username: string;
  password: string;
  channel: number;
  base: string;
  live: boolean;
  fallback: boolean;
};


export function payheroConfig(): PayheroConfig {
  const username = env("PAYHERO_API_USERNAME");
  const password = env("PAYHERO_API_PASSWORD");
  const channel = Number(env("PAYHERO_CHANNEL_ID")) || 0;
  const base = env("PAYHERO_BASE_URL", "https://backend.payhero.co.ke/api/v2").replace(/\/$/, "");
  return {
    username,
    password,
    channel,
    base,
    live: flag("PAYHERO_ENABLED", false) && Boolean(username && password && channel),
    fallback: flag("PAYHERO_FALLBACK_SANDBOX", false),
  };
}

/* ------------------------------------------------------------------------ SMS */
export function smsConfig() {
  return {
    username: env("AT_USERNAME"),
    apiKey: env("AT_API_KEY"),
    senderId: env("AT_SENDER_ID"),
    debugCodes: process.env.NODE_ENV !== "production" && flag("OTP_DEBUG", false),
  };
}

/* ----------------------------------------------------------------------- mail */
export function mailConfig() {
  const resendKey = env("RESEND_API_KEY");
  const smtpHost = env("SMTP_HOST");
  const smtpUser = env("SMTP_USER");
  const channel: "resend" | "smtp" | "queue" = resendKey ? "resend" : smtpHost && smtpUser ? "smtp" : "queue";
  return {
    channel,
    resendKey,
    smtp: {
      host: smtpHost,
      port: Number(env("SMTP_PORT", "587")) || 587,
      secure: flag("SMTP_SECURE", false),
      user: smtpUser,
      pass: env("SMTP_PASS"),
    },
  };
}

/** Short label safe to show in the operator console (never includes secrets). */
export function integrationSummary() {
  const pay = payheroConfig();
  const mail = mailConfig();
  const sms = smsConfig();
  return {
    payments: pay.live ? "PAYHERO (live)" : "SANDBOX simulator",
    payheroChannel: pay.live ? pay.channel : null,
    mail: mail.channel === "queue" ? "queued in operator console" : mail.channel.toUpperCase(),
    sms: sms.username && sms.apiKey ? "Africa's Talking" : "demo inbox",
  };
}
