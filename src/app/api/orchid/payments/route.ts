import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, ORCHID_CODE, withCodeRetry, parseDateVN } from "@/lib/orchid/server";
import { orchidPaymentSchema } from "@/lib/orchid/schemas";

// Ghi nhận thanh toán: khách trả tiền (customer) / trả tiền NCC (supplier) / điểm bán nộp tiền (point).
export async function POST(req: NextRequest) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const parsed = orchidPaymentSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = parsed.data;
  const common = {
    paymentDate: parseDateVN(d.paymentDate),
    amount: d.amount,
    method: d.method,
    accountId: d.accountId || null,
    note: d.note || null,
    createdById: guard.user.id,
    createdByName: guard.user.name,
  };

  return handleOrchidError(async () => {
    const payment = await withCodeRetry(() =>
      prisma.$transaction(async (tx) => {
        if (d.kind === "customer") {
          return tx.orchidCustomerPayment.create({ data: { ...common, code: await ORCHID_CODE.customerPayment(tx), customerId: d.targetId, orderId: d.docId || null } });
        }
        if (d.kind === "supplier") {
          return tx.orchidSupplierPayment.create({ data: { ...common, code: await ORCHID_CODE.supplierPayment(tx), supplierId: d.targetId, receiptId: d.docId || null } });
        }
        const { paymentDate, amount, method, accountId, note, createdById, createdByName } = common;
        return tx.orchidRetailPayment.create({ data: { pointId: d.targetId, paymentDate, amount, method, accountId, note, createdById, createdByName } });
      })
    );
    return NextResponse.json(payment, { status: 201 });
  });
}
