import { db } from "@/db";
import { bonusRequests } from "@/db/schema";
import { requireUser } from "@/lib/server/session";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TYPES = ["welcome", "deposit", "promo", "cashback", "freebet"];

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const rows = await db
    .select()
    .from(bonusRequests)
    .where(eq(bonusRequests.userId, auth.user.id))
    .orderBy(desc(bonusRequests.id))
    .limit(50);

  return Response.json({
    requests: rows.map((r) => ({
      id: r.id,
      type: r.type,
      code: r.code,
      amount: Number(r.amount),
      message: r.message,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const type = String(body.type ?? "promo").toLowerCase();
  const code = String(body.code ?? "").trim().toUpperCase().slice(0, 24) || null;
  const amount = Math.floor(Number(body.amount) * 100) / 100;
  const message = String(body.message ?? "").trim().slice(0, 400) || null;

  if (!TYPES.includes(type)) return Response.json({ error: "Unknown bonus type." }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 50 || amount > 50000) {
    return Response.json({ error: "Request an amount between KES 50 and KES 50,000." }, { status: 400 });
  }

  const pending = await db
    .select()
    .from(bonusRequests)
    .where(eq(bonusRequests.userId, auth.user.id))
    .orderBy(desc(bonusRequests.id))
    .limit(10);
  const alreadyPending = pending.some((p) => p.status === "pending");
  if (alreadyPending) {
    return Response.json(
      { error: "You already have a bonus request awaiting operator approval." },
      { status: 409 },
    );
  }

  const [row] = await db
    .insert(bonusRequests)
    .values({ userId: auth.user.id, type, code, amount: amount.toFixed(2), message, status: "pending" })
    .returning({ id: bonusRequests.id });

  return Response.json({ ok: true, id: row.id });
}
