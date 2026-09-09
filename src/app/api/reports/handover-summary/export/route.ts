import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { computeHandoverSummaryForPeriod } from "@/lib/handover-summary-report";
import { buildHandoverSummaryWorkbook } from "@/lib/handover-summary-workbook";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "HANH_CHINH_NHAN_SU") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const warehouseId = searchParams.get("warehouseId") || undefined;

  const result = await computeHandoverSummaryForPeriod(monthParam, warehouseId);
  const workbook = buildHandoverSummaryWorkbook(result);
  const buffer = await workbook.xlsx.writeBuffer();

  const monthLabel = monthParam ?? format(new Date(), "yyyy-MM");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ban-giao-ghi-nhan-${monthLabel}-${format(new Date(), "yyyyMMdd")}.xlsx"`,
    },
  });
}
