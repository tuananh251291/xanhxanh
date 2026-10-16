import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidSuperAdmin, badRequest, handleOrchidError, ORCHID_CODE, withCodeRetry, parseDateVN } from "@/lib/orchid/server";
import { orchidExpenseSchema } from "@/lib/orchid/schemas";

export async function POST(req: NextRequest) {
  const guard = await requireOrchidSuperAdmin();
  if ("error" in guard) return guard.error;
  const parsed = orchidExpenseSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = parsed.data;
  return handleOrchidError(async () => {
    const expense = await withCodeRetry(() =>
      prisma.$transaction(async (tx) =>
        tx.orchidExpense.create({
          data: {
            code: await ORCHID_CODE.expense(tx),
            expenseDate: parseDateVN(d.expenseDate),
            categoryId: d.categoryId,
            amount: d.amount,
            recipient: d.recipient || null,
            method: d.method,
            accountId: d.accountId || null,
            content: d.content || null,
            createdById: guard.user.id,
            createdByName: guard.user.name,
          },
        })
      )
    );
    return NextResponse.json(expense, { status: 201 });
  });
}
