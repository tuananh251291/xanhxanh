import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { addMonths, format, isValid } from "date-fns";
import { getTaskMonth, getForecastDeadline, getForecastTargetMonths, getRootingForecastOverview } from "@/lib/rooting-forecast";

// Toàn cảnh "Dự kiến đáp ứng cây ra rễ" mọi cơ sở sản xuất cho Admin xem bản NV Kỹ thuật đã nộp — mirror
// src/app/api/reports/mother-forecast/route.ts. Query param taskMonth (yyyy-MM-dd, tuỳ chọn) = xem lại
// lộ trình 3 tháng cũ, mặc định là lộ trình đang mở hiện tại — không cho xem lộ trình TƯƠNG LAI.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role ?? null)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const currentTaskMonth = getTaskMonth();
  const taskMonthParam = req.nextUrl.searchParams.get("taskMonth");
  let taskMonth = currentTaskMonth;
  if (taskMonthParam) {
    const parsed = new Date(taskMonthParam);
    if (!isValid(parsed)) return NextResponse.json({ message: "taskMonth không hợp lệ" }, { status: 400 });
    taskMonth = parsed > currentTaskMonth ? currentTaskMonth : parsed;
  }

  const warehouses = await getRootingForecastOverview(taskMonth);
  return NextResponse.json({
    taskMonth: format(taskMonth, "yyyy-MM-dd"),
    targetMonths: getForecastTargetMonths(taskMonth).map((d) => format(d, "yyyy-MM-dd")),
    deadline: format(getForecastDeadline(taskMonth), "yyyy-MM-dd"),
    prevTaskMonth: format(addMonths(taskMonth, -3), "yyyy-MM-dd"),
    nextTaskMonth: taskMonth < currentTaskMonth ? format(addMonths(taskMonth, 3), "yyyy-MM-dd") : null,
    warehouses,
  });
}
