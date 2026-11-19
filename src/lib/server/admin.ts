import "server-only";
import { normalizePhone } from "./phone";
import { adminName, adminPassword as cfgAdminPassword, adminPhoneRaw } from "./config";

/**
 * Operator (admin) credentials live in server-side environment variables.
 * They are NEVER imported by any client component, never serialised into an
 * API response and never rendered into HTML — the browser only ever sees
 * boolean success/failure from /api/admin/login.
 */
export function getAdminPhone(): string {
  return normalizePhone(adminPhoneRaw()) || "";
}

export function getAdminPassword(): string {
  return cfgAdminPassword();
}

export function getAdminName(): string {
  return adminName();
}

export function isAdminPhone(phone: string | null): boolean {
  if (!phone) return false;
  return normalizePhone(phone) === getAdminPhone();
}

/** Constant-time-ish comparison for the operator password. */
export function isAdminPassword(candidate: string): boolean {
  const expected = getAdminPassword();
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  if (candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
