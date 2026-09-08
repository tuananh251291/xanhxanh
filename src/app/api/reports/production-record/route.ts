import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { computeProductionRecordForPeriod } from "@/lib/production-record-report";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  // NV Kỹ thuật chỉ xem được đúng khu sản xuất mình đang làm việc — ép cứng ở server, khớp quy ước ở
  // /api/reports/planting-log-summary.
  const warehouseId = role === "KY_THUAT" ? session!.user.workplaceWarehouseId ?? undefined : searchParams.get("warehouseId") || undefined;

  const result = await computeProductionRecordForPeriod(monthParam, warehouseId);
  return NextResponse.json(result);
}
