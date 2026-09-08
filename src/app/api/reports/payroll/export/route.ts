import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { computePayrollForPeriod } from "@/lib/payroll-calculation";
import { buildPayrollWorkbook } from "@/lib/payroll-workbook";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const warehouseId = searchParams.get("warehouseId") || undefined;

  const result = await computePayrollForPeriod(monthParam, warehouseId);
  const workbook = buildPayrollWorkbook(result);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bang-luong-${result.periodMonth}-${format(new Date(), "yyyyMMdd")}.xlsx"`,
    },
  });
}
