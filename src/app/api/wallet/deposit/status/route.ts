import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireUser } from "@/lib/server/session";
import { settleDeposit } from "@/lib/server/payments";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const reference = new URL(req.url).searchParams.get("reference")?.trim();
  if (!reference) return Response.json({ error: "reference is required." }, { status: 400 });

  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.reference, reference), eq(transactions.userId, auth.user.id)))
    .limit(1);
  if (!tx) return Response.json({ error: "Transaction not found." }, { status: 404 });

  const result = await settleDeposit(reference);
  return Response.json({
    ok: true,
    state: result.outcome === "credited" || result.outcome === "already" ? "completed" : result.outcome,
    amount: Number(tx.amount),
    balance: result.balance ?? Number(tx.balanceAfter),
    gateway: tx.gateway,
    method: tx.method,
  });
}
