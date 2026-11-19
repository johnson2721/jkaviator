import crypto from "node:crypto";

/** scrypt password hashing (no native deps needed). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password.normalize("NFKC"), salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const derived = crypto.scryptSync(password.normalize("NFKC"), salt, 64);
    const expected = Buffer.from(hash, "hex");
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateOtp(): string {
  // 6 digit numeric code from a CSPRNG
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Deterministic mask for public display of player names: Kamau -> K***u */
export function maskName(name: string): string {
  const clean = (name || "").trim();
  if (clean.length <= 2) return `${clean.charAt(0).toUpperCase()}***`;
  return `${clean.charAt(0).toUpperCase()}***${clean.slice(-1).toLowerCase()}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "***";
  return `+${digits.slice(0, digits.length - 6)}******${digits.slice(-2)}`;
}
