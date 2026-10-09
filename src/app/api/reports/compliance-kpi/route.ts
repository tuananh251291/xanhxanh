import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { buildComplianceKpiReport } from "@/lib/compliance-kpi-report";

// KPI tuân thủ NV cấy mô theo kỳ lương (?month=yyyy-MM), lọc theo khu sản xuất (?warehouseId=). Có số
// tiền thưởng (dữ liệu lương) nên chỉ SUPER_ADMIN + NV Hành chính nhân sự, giống Bảng lương.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const report = await buildComplianceKpiReport(searchParams.get("month"), searchParams.get("warehouseId") || undefined);
  return NextResponse.json(report);
}
