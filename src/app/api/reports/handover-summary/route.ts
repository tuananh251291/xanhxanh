import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { computeHandoverSummaryForPeriod } from "@/lib/handover-summary-report";

// Báo cáo "Bàn giao & ghi nhận theo tháng" — cho Admin + NV Hành chính nhân sự (chỉ xem) — xem
// computeHandoverSummaryForPeriod (src/lib/handover-summary-report.ts) cho công thức tính, CÙNG mốc
// tháng lịch + công thức "ghi nhận" với báo cáo "Số lượng ghi nhận" của Admin
// (production-record-report.ts) để 2 báo cáo luôn khớp số.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "HANH_CHINH_NHAN_SU") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const warehouseId = searchParams.get("warehouseId") || undefined;

  const result = await computeHandoverSummaryForPeriod(dateFrom, dateTo, warehouseId);
  const totalHandedOver = result.rows.reduce((s, r) => s + r.totalHandedOverQuantity, 0);
  const totalRecorded = result.rows.reduce((s, r) => s + r.totalRecordedQuantity, 0);

  return NextResponse.json({
    ...result,
    summary: { totalHandedOver, totalRecorded, staffCount: result.rows.length },
  });
}
