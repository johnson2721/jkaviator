import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireUser, toPublicUser } from "@/lib/server/session";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, auth.user.id))
    .orderBy(desc(transactions.id))
    .limit(80);

  return Response.json({
    user: toPublicUser(auth.user),
    transactions: rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount),
      balanceAfter: Number(r.balanceAfter),
      status: r.status,
      method: r.method,
      reference: r.reference,
      note: r.note,
      createdAt: r.createdAt,
    })),
  });
}
