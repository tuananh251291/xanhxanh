import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { computePartnerDamageReport } from "@/lib/partner-damage-report";

// Báo cáo "Hỏng hủy" — Đối tác vận hành chỉ xem đúng kho mình phụ trách (workplaceWarehouseId); NV bán
// hàng (isRetailManager) chỉ xem (các) kho được gán qua RetailWarehouseAccess; Admin xem tất cả hoặc lọc
// theo 1 kho — cùng quy ước phân quyền với GET /api/reject-classifications + /inventory/thi-truong.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const requestedWarehouseId = searchParams.get("warehouseId") || undefined;

  let warehouseIds: string[] | null = null;
  if (role === "DOI_TAC_VAN_HANH") {
    if (!session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Bạn chưa được gán Kho thị trường phụ trách" }, { status: 403 });
    }
    warehouseIds = [session.user.workplaceWarehouseId];
  } else if (role === "SALE") {
    const access = await prisma.retailWarehouseAccess.findMany({ where: { userId: session.user.id }, select: { warehouseId: true } });
    if (access.length === 0) return NextResponse.json({ message: "Bạn chưa được gán Kho thị trường nào" }, { status: 403 });
    const allowed = access.map((a) => a.warehouseId);
    warehouseIds = requestedWarehouseId ? allowed.filter((wid) => wid === requestedWarehouseId) : allowed;
  } else if (isAdminRole(role)) {
    warehouseIds = requestedWarehouseId ? [requestedWarehouseId] : null;
  } else {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const result = await computePartnerDamageReport(monthParam, warehouseIds);
  return NextResponse.json(result);
}
