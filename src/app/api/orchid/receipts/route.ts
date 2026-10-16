import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, ORCHID_CODE, withCodeRetry, parseDateVN, addDays } from "@/lib/orchid/server";
import { orchidReceiptSchema } from "@/lib/orchid/schemas";

// Phiếu nhập — mỗi dòng sinh 1 lô mới (mã lô tự sinh), cộng công nợ phải trả NCC = Σ SL × giá nhập + chi phí khác.
export async function POST(req: NextRequest) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const parsed = orchidReceiptSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = parsed.data;

  return handleOrchidError(async () => {
    const receipt = await withCodeRetry(() =>
      prisma.$transaction(async (tx) => {
        const receiptDate = parseDateVN(d.receiptDate);
        const supplier = d.supplierId ? await tx.orchidSupplier.findUnique({ where: { id: d.supplierId } }) : null;
        const dueDate = d.dueDate ? parseDateVN(d.dueDate) : supplier ? addDays(receiptDate, supplier.paymentTermDays) : null;
        const totalAmount = d.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCost), 0) + Math.round(d.otherCost);
        const created = await tx.orchidGoodsReceipt.create({
          data: {
            code: await ORCHID_CODE.receipt(tx),
            supplierId: supplier?.id ?? null,
            warehouseId: d.warehouseId,
            receiptDate,
            dueDate,
            otherCost: d.otherCost,
            totalAmount,
            note: d.note || null,
            createdById: guard.user.id,
            createdByName: guard.user.name,
          },
        });
        for (const l of d.lines) {
          await tx.orchidLot.create({
            data: {
              code: await ORCHID_CODE.lot(tx),
              productId: l.productId,
              supplierId: supplier?.id ?? null,
              warehouseId: d.warehouseId,
              receiptId: created.id,
              receivedDate: receiptDate,
              quantityIn: l.quantity,
              quantityRemaining: l.quantity,
              unitCost: l.unitCost,
              note: l.note || null,
            },
          });
        }
        return created;
      })
    );
    return NextResponse.json(receipt, { status: 201 });
  });
}
