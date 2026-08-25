import { prisma } from "@/lib/prisma";
import { addDays, isPast } from "date-fns";
import type { ReturnInspectionItem } from "@/components/shared/return-inspection-table";

// Dòng nhập hàng (của NCC cho phép trả hàng, Supplier.allowsReturn) đang chờ kiểm tra trả hàng — dùng
// chung ở /goods-receipts (NV kho thành phẩm thao tác) và /task-assignment (Quản lý kho thành phẩm theo
// dõi/thao tác hộ, mục "6. Trả hàng nhà cung cấp"). warehouseId = "" khi NV chưa được gán kho (không có
// dòng nào khớp, giống các query khác trong 2 trang này).
export async function getPendingReturnInspections(warehouseId: string): Promise<ReturnInspectionItem[]> {
  const items = await prisma.goodsReceiptItem.findMany({
    where: {
      returnedAt: null,
      receipt: { status: "CONFIRMED", supplier: { allowsReturn: true }, room: { warehouseId } },
    },
    orderBy: { receipt: { createdAt: "asc" } },
    select: {
      id: true, quantityPassed: true, stageCode: true,
      plantType: { select: { code: true, name: true } },
      receipt: { select: { code: true, createdAt: true, supplier: { select: { name: true, returnWindowDays: true } } } },
    },
  });

  return items.map((item) => {
    const deadline = addDays(item.receipt.createdAt, item.receipt.supplier.returnWindowDays ?? 0);
    return {
      id: item.id,
      receiptCode: item.receipt.code,
      supplierName: item.receipt.supplier.name,
      plantCode: item.plantType.code,
      plantName: item.plantType.name,
      stageCode: item.stageCode,
      quantityPassed: item.quantityPassed,
      deadlineLabel: `Cần kiểm tra trước ${deadline.toLocaleDateString("vi-VN")}`,
      overdue: isPast(deadline),
    };
  });
}
