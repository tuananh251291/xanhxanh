import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { vnDateKey } from "@/lib/attendance";
import { MONTH_REGEX, buildMonthlyTimesheet, isAttendanceHr } from "@/lib/attendance-server";

// GET ?month=yyyy-MM&warehouseId= — HCNS xem bảng công tháng (mọi khu hoặc 1 khu).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAttendanceHr(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") ?? vnDateKey(new Date()).slice(0, 7);
  if (!MONTH_REGEX.test(month)) return NextResponse.json({ message: "Tháng không hợp lệ" }, { status: 400 });
  const timesheet = await buildMonthlyTimesheet({ month, warehouseId: sp.get("warehouseId") || null });
  return NextResponse.json({ month, todayKey: vnDateKey(new Date()), ...timesheet });
}
