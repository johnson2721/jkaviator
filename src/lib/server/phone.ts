/** Normalises Kenyan / international MSISDNs into +2547XXXXXXXX style. */
export function normalizePhone(input: string): string | null {
  if (!input) return null;
  let raw = String(input).trim().replace(/[\s\-()]/g, "");
  if (!raw.startsWith("+")) {
    if (raw.startsWith("00")) raw = raw.slice(2);
    else if (raw.startsWith("0")) raw = `254${raw.slice(1)}`;
    else if (raw.startsWith("254")) raw = raw;
    else if (raw.startsWith("7") || raw.startsWith("1")) raw = `254${raw}`;
    else raw = `254${raw}`;
  } else {
    raw = raw.slice(1);
  }
  if (!/^\d{9,15}$/.test(raw)) return null;
  return `+${raw}`;
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(input || "").trim()) && input.trim().length <= 160;
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (!password || password.length < 6) issues.push("at least 6 characters");
  if (password && password.length > 72) issues.push("at most 72 characters");
  return issues;
}
