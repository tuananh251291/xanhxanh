import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SURPLUS_TRANSFER_TAG } from "@/types";

// Danh sách phiếu bàn giao Phòng tối đang chờ của NV luồng Đỏ/Vàng/chưa có dữ liệu luồng — gộp theo
// TỪNG PHIẾU (khác luồng Xanh gộp theo NV), vì bước kiểm tra nhiễm áp dụng riêng cho từng đợt bàn giao.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json([]);

  const transfers = await prisma.transfer.findMany({
    where: {
      status: "PENDING",
      fromRoom: { type: "PHONG_TOI", warehouseId: workplaceWarehouseId },
      // Cùng mẫu liệt kê rõ ràng đã dùng ở nơi khác (transfers/route.ts) — không dùng `not: "XANH"`
      // để tránh phụ thuộc cách Prisma xử lý null trong so sánh bất đẳng thức trên field nullable.
      OR: [{ fromUser: { inspectionLane: { in: ["DO", "VANG"] } } }, { fromUser: { inspectionLane: null } }],
      // notes nullable — `not`/`NOT` dịch sang SQL `<>` sẽ loại luôn cả dòng NULL (đa số phiếu
      // thường không phải surplus nên notes luôn null). Đã gặp đúng bug này lúc build luồng Xanh.
      AND: [{ OR: [{ notes: null }, { notes: { not: SURPLUS_TRANSFER_TAG } }] }],
    },
    select: {
      id: true,
      code: true,
      transferredAt: true,
      fromUser: { select: { code: true, name: true } },
      inspection: { select: { id: true } },
      items: {
        where: { confirmedAt: null },
        select: { quantity: true, lot: { select: { code: true, stageCode: true, enteredAt: true } } },
      },
    },
    orderBy: { transferredAt: "asc" },
  });

  const rows = transfers
    .filter((t) => t.items.length > 0)
    .map((t) => ({
      transferId: t.id,
      code: t.code,
      transferredAt: t.transferredAt,
      staffCode: t.fromUser.code,
      staffName: t.fromUser.name,
      items: t.items.map((i) => ({ lotCode: i.lot.code, stageCode: i.lot.stageCode, quantity: i.quantity, enteredAt: i.lot.enteredAt })),
      totalQuantity: t.items.reduce((s, i) => s + i.quantity, 0),
      hasInspection: t.inspection !== null,
    }));

  return NextResponse.json(rows);
}
