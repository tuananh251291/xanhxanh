import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { computePayrollForPeriod } from "@/lib/payroll-calculation";

// "Bảng lương" — cho SUPER_ADMIN + NV Hành chính nhân sự (dữ liệu lương nhạy cảm). Tính SỐNG mỗi lần
// gọi, xem src/lib/payroll-calculation.ts.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const warehouseId = searchParams.get("warehouseId") || undefined;

  const result = await computePayrollForPeriod(monthParam, warehouseId);
  return NextResponse.json(result);
}
