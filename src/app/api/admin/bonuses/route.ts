import { db } from "@/db";
import { bonusRequests, transactions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/session";
import { desc, eq, sql } from "drizzle-orm";
import { creditWallet, getActiveCurrency, refreshMirror } from "@/lib/server/wallet";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const status = new URL(req.url).searchParams.get("status") ?? "all";
  const rows = await db
    .select({
      id: bonusRequests.id,
      type: bonusRequests.type,
      code: bonusRequests.code,
      amount: bonusRequests.amount,
      message: bonusRequests.message,
      status: bonusRequests.status,
      adminNote: bonusRequests.adminNote,
      createdAt: bonusRequests.createdAt,
      reviewedAt: bonusRequests.reviewedAt,
      userId: users.id,
      userName: users.name,
      userPhone: users.phone,
      userBalance: users.balance,
    })
    .from(bonusRequests)
    .innerJoin(users, eq(users.id, bonusRequests.userId))
    .where(status === "all" ? sql`true` : eq(bonusRequests.status, status))
    .orderBy(desc(bonusRequests.id))
    .limit(120);

  return Response.json({
    bonuses: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      userBalance: Number(r.userBalance),
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

  const [request] = await db
    .select()
    .from(bonusRequests)
    .where(eq(bonusRequests.id, id))
    .limit(1);
  if (!request) return Response.json({ error: "Request not found." }, { status: 404 });
  if (request.status !== "pending") {
    return Response.json({ error: "This request was already processed." }, { status: 409 });
  }
  if (decision !== "approve" && decision !== "reject") {
    return Response.json({ error: "Decision must be approve or reject." }, { status: 400 });
  }

  if (decision === "reject") {
    await db
      .update(bonusRequests)
      .set({ status: "rejected", adminNote: note, reviewedBy: auth.user.id, reviewedAt: new Date() })
      .where(eq(bonusRequests.id, id));
    return Response.json({ ok: true, status: "rejected" });
  }

  const amount = Number(request.amount);
  const currency = await getActiveCurrency(request.userId);
  await creditWallet(request.userId, amount, currency, "bonus");
  const credited = await creditWallet(request.userId, amount, currency);
  const balanceAfter = (await refreshMirror(request.userId)).toFixed(2);

  await db.insert(transactions).values({
    userId: request.userId,
    type: "bonus",
    amount: amount.toFixed(2),
    balanceAfter,
    currency,
    status: "completed",
    method: "BONUS",
    reference: `BNS-${request.id}`,
    note: note ?? `${request.type} bonus approved by operator`,
    reviewedBy: auth.user.id,
    reviewedAt: new Date(),
  });
  await db
    .update(bonusRequests)
    .set({ status: "approved", adminNote: note, reviewedBy: auth.user.id, reviewedAt: new Date() })
    .where(eq(bonusRequests.id, id));

  return Response.json({ ok: true, status: "approved", credited: amount, currency, balance: credited.balance });
}
