import { db } from "@/db";
import { transactions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/session";
import { and, desc, eq, sql } from "drizzle-orm";
import { creditWallet } from "@/lib/server/wallet";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const status = new URL(req.url).searchParams.get("status") ?? "all";
  const rows = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      method: transactions.method,
      reference: transactions.reference,
      note: transactions.note,
      details: transactions.details,
      notifiedAt: transactions.notifiedAt,
      gateway: transactions.gateway,
      status: transactions.status,
      createdAt: transactions.createdAt,
      reviewedAt: transactions.reviewedAt,
      userId: users.id,
      userName: users.name,
      userPhone: users.phone,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .where(and(eq(transactions.type, "withdrawal"), status === "all" ? sql`true` : eq(transactions.status, status)))
    .orderBy(desc(transactions.id))
    .limit(120);

  return Response.json({
    withdrawals: rows.map((r) => ({
      ...r,
      amount: Math.abs(Number(r.amount)),
      details: (() => {
        try {
          return r.details ? (JSON.parse(r.details) as Record<string, string>) : null;
        } catch {
          return null;
        }
      })(),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const decision = String(body.decision ?? "");
  const note = String(body.note ?? "").trim().slice(0, 300) || null;

  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.type, "withdrawal")))
    .limit(1);
  if (!tx) return Response.json({ error: "Withdrawal not found." }, { status: 404 });
  if (tx.status !== "pending") return Response.json({ error: "Already processed." }, { status: 409 });
  if (decision !== "approve" && decision !== "reject") {
    return Response.json({ error: "Decision must be approve or reject." }, { status: 400 });
  }

  if (decision === "reject") {
    const refund = Math.abs(Number(tx.amount));
    const credited = await creditWallet(tx.userId, refund, (tx.currency || "KES").toUpperCase());
    const updated = { balance: credited.balance.toFixed(2) };
    await db
      .update(transactions)
      .set({
        status: "rejected",
        note: note ?? tx.note,
        reviewedBy: auth.user.id,
        reviewedAt: new Date(),
        balanceAfter: updated.balance,
      })
      .where(eq(transactions.id, id));
    return Response.json({ ok: true, status: "rejected", refunded: refund });
  }

  await db
    .update(transactions)
    .set({ status: "completed", note: note ?? tx.note, reviewedBy: auth.user.id, reviewedAt: new Date() })
    .where(eq(transactions.id, id));
  return Response.json({ ok: true, status: "completed" });
}
