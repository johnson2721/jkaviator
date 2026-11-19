import "server-only";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "av_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type PublicUser = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  balance: number;
  bonusBalance: number;
  currency: string;
  totalStaked: number;
  totalWon: number;
  betsCount: number;
};

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    balance: Number(u.balance),
    bonusBalance: Number(u.bonusBalance),
    currency: u.currency,
    totalStaked: Number(u.totalStaked),
    totalWon: Number(u.totalWon),
    betsCount: u.betsCount,
  };
}

export async function createSession(userId: number, userAgent?: string | null): Promise<string> {
  const token = randomToken(32);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

/** True only when the request really arrived over TLS (respects proxy headers). */
export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Session cookies must survive two very different contexts:
 *  - a normal top-level tab  -> SameSite=Lax is fine
 *  - the app embedded in an iframe (preview panels, webviews) -> Lax cookies are
 *    dropped by the browser, so we need SameSite=None + Secure.
 * The bearer token below is the belt-and-braces fallback for browsers that block
 * third-party cookies altogether.
 */
export async function setSessionCookie(token: string, secure = true) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Reads the session token from the cookie, or from an Authorization/x-session-token header. */
export async function readSessionToken(): Promise<string | null> {
  try {
    const store = await cookies();
    const fromCookie = store.get(SESSION_COOKIE)?.value;
    if (fromCookie) return fromCookie;
  } catch {
    /* called outside a request scope */
  }
  try {
    const h = await headers();
    const auth = h.get("authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) {
      const token = auth.slice(7).trim();
      if (token) return token;
    }
    const custom = h.get("x-session-token");
    if (custom && custom.trim()) return custom.trim();
  } catch {
    /* no request headers available */
  }
  return null;
}

export async function destroySession() {
  const token = await readSessionToken();
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
  try {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
  } catch {
    /* ignore */
  }
}

export async function getSessionUser(): Promise<User | null> {
  const token = await readSessionToken();
  if (!token) return null;
  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

export async function requireUser(): Promise<{ user: User } | { error: string; status: number }> {
  const user = await getSessionUser();
  if (!user) return { error: "You must be logged in.", status: 401 };
  if (user.status === "blocked") return { error: "This account is blocked.", status: 403 };
  return { user };
}

export async function requireAdmin(): Promise<{ user: User } | { error: string; status: number }> {
  const user = await getSessionUser();
  if (!user) return { error: "Operator session required.", status: 401 };
  if (user.role !== "admin") return { error: "Forbidden.", status: 403 };
  return { user };
}
