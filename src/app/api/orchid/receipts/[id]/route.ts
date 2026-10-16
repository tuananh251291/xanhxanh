import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, handleOrchidError, OrchidError } from "@/lib/orchid/server";

// Xoá phiếu nhập lỡ nhập sai — chỉ khi chưa lô nào bị xuất/điều chuyển và chưa trả tiền NCC theo phiếu này.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  return handleOrchidError(async () => {
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.orchidGoodsReceipt.findUniqueOrThrow({
        where: { id },
        include: { lots: { include: { _count: { select: { allocations: true, transferItems: true } } } }, _count: { select: { payments: true } } },
      });
      if (receipt._count.payments > 0) throw new OrchidError("Phiếu nhập đã có thanh toán NCC, không xoá được");
      const used = receipt.lots.some((l) => l.quantityRemaining !== l.quantityIn || l._count.allocations > 0 || l._count.transferItems > 0);
      if (used) throw new OrchidError("Đã có lô của phiếu này được xuất bán/điều chuyển, không xoá được");
      await tx.orchidLot.deleteMany({ where: { receiptId: id } });
      await tx.orchidGoodsReceipt.delete({ where: { id } });
    });
    return NextResponse.json({ success: true });
  });
}
