import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { format, isValid } from "date-fns";
import { getTaskMonth, getForecastTargetMonths, getMotherForecastOverview } from "@/lib/mother-forecast";
import { buildMotherForecastWorkbook } from "@/lib/mother-forecast-workbook";

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

  const targetMonths = getForecastTargetMonths(taskMonth);
  const warehouses = await getMotherForecastOverview(taskMonth);
  const workbook = buildMotherForecastWorkbook(warehouses, targetMonths);
  const buffer = await workbook.xlsx.writeBuffer();

  const rangeLabel = `${format(targetMonths[0], "MM-yyyy")}_den_${format(targetMonths[2], "MM-yyyy")}`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="du-kien-dap-ung-mau-me-${rangeLabel}-${format(new Date(), "yyyyMMdd")}.xlsx"`,
    },
  });
}
