import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { computeInspectionDefectReport } from "@/lib/inspection-defect-report";
import { buildInspectionDefectWorkbook } from "@/lib/inspection-defect-workbook";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const warehouseId = !isAdminRole(role) ? session!.user.workplaceWarehouseId ?? undefined : searchParams.get("warehouseId") || undefined;

  const result = await computeInspectionDefectReport(monthParam, warehouseId);
  const workbook = buildInspectionDefectWorkbook(result);
  const buffer = await workbook.xlsx.writeBuffer();

  const monthLabel = monthParam ?? format(new Date(), "yyyy-MM");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="phieu-kiem-tra-khong-dat-nhiem-${monthLabel}-${format(new Date(), "yyyyMMdd")}.xlsx"`,
    },
  });
}
