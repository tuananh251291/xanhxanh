import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Số nhiễm đang "chờ xử lý" (chưa gộp vào dòng nháp nào) của kho sản xuất Kho mô đang làm việc, tách
// theo NV cấy mô báo nhiễm — dùng đổ danh sách tên NV + số lượng cho "Kiểm tra kho nhiễm cá nhân" (xem
// dark-room-check). staffId = "" gộp lại thành 1 mục "Chưa rõ NV / tồn cũ" ở phía client.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json([]);

  const balances = await prisma.contaminationStaffBalance.findMany({
    where: { warehouseId, quantity: { gt: 0 } },
    include: { plantType: { select: { code: true, name: true } } },
  });
  if (balances.length === 0) return NextResponse.json([]);

  const staffIds = [...new Set(balances.map((b) => b.staffId).filter((id) => id !== ""))];
  const staffList = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, code: true, name: true } })
    : [];
  const staffById = new Map(staffList.map((s) => [s.id, s]));

  return NextResponse.json(
    balances
      .map((b) => ({
        staffId: b.staffId,
        staffCode: staffById.get(b.staffId)?.code ?? null,
        staffName: staffById.get(b.staffId)?.name ?? null,
        plantTypeId: b.plantTypeId,
        plantTypeCode: b.plantType.code,
        plantTypeName: b.plantType.name,
        stageCode: b.stageCode,
        category: b.category,
        quantity: b.quantity,
      }))
      .sort((a, b) => (a.staffName ?? "").localeCompare(b.staffName ?? "") || a.plantTypeCode.localeCompare(b.plantTypeCode))
  );
}
