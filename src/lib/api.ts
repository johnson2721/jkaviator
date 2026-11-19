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

/* ------------------------------------------------------- session token ---
 * The token is a fallback for environments where cookies are blocked (the app
 * running inside an iframe, or strict third-party cookie settings). It is kept
 * in localStorage and attached to every API call as a bearer token.
 */
const TOKEN_KEY = "av_session_token";
const USER_KEY = "av_session_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage disabled */
  }
}

export function cacheUser(user: unknown): void {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function readCachedUser(): PublicUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<{ ok: boolean; status: number; data: T }> {
  const token = getToken();
  try {
    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error. Check your connection." } as T };
  }
}

export function errorMessage(data: unknown, fallback = "Something went wrong."): string {
  if (data && typeof data === "object" && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string" && e.length) return e;
  }
  return fallback;
}

export function kes(value: number | string | null | undefined, decimals = 2): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-KE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function multiplierColor(m: number): string {
  if (m < 2) return "text-sky-400 border-sky-500/40 bg-sky-500/10";
  if (m < 10) return "text-violet-300 border-violet-500/40 bg-violet-500/10";
  return "text-pink-400 border-pink-500/40 bg-pink-500/10";
}

export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const then = new Date(date).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(date).toLocaleDateString("en-KE", { day: "2-digit", month: "short" });
}
