import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";

const include = {
  transfer: { select: { code: true, transferredAt: true } },
  warehouse: { select: { code: true, name: true } },
  createdBy: { select: { code: true, name: true } },
  approvedBy: { select: { code: true, name: true } },
  items: { include: { plantType: { select: { code: true, name: true } } } },
} as const;

// Danh sách RejectedGoodsClassification — Đối tác vận hành chỉ thấy đúng kho mình phụ trách
// (workplaceWarehouseId); NV bán hàng (isRetailManager) chỉ thấy đúng (các) kho được gán qua
// RetailWarehouseAccess; Admin thấy tất cả.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const where: Record<string, unknown> = status ? { status } : {};

  if (role === "DOI_TAC_VAN_HANH") {
    if (!session.user.workplaceWarehouseId) return NextResponse.json([]);
    where.warehouseId = session.user.workplaceWarehouseId;
  } else if (role === "SALE") {
    const access = await prisma.retailWarehouseAccess.findMany({
      where: { userId: session.user.id },
      select: { warehouseId: true },
    });
    if (access.length === 0) return NextResponse.json([]);
    where.warehouseId = { in: access.map((a) => a.warehouseId) };
  } else if (!isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const rows = await prisma.rejectedGoodsClassification.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}
