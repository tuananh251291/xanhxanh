import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { computeInspectionDefectReport } from "@/lib/inspection-defect-report";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  // NV Kỹ thuật/Kho mô chỉ xem được đúng khu sản xuất mình đang làm việc — khớp quy ước ở
  // /api/reports/planting-log-summary + reports/inspection-lane.
  const warehouseId = !isAdminRole(role) ? session!.user.workplaceWarehouseId ?? undefined : searchParams.get("warehouseId") || undefined;

  const result = await computeInspectionDefectReport(monthParam, warehouseId);
  return NextResponse.json(result);
}
