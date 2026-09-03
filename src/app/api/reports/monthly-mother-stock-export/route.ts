import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getReportMonthColumns, computeMotherStockByFacility } from "@/lib/monthly-stock-export";
import { buildMonthlyStockWorkbook } from "@/lib/monthly-stock-workbook";
import { format } from "date-fns";

// Xuất Excel "Số tồn kho mẫu mẹ cuối kì hàng tháng, phân loại theo cơ sở" — từ tháng 7/2026 đến tháng
// hiện tại (xem getReportMonthColumns), chỉ Admin/SUPER_ADMIN được tải (xem report-center/downloads).
export async function GET() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role ?? null)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const months = getReportMonthColumns();
  const rows = await computeMotherStockByFacility(months);
  const workbook = buildMonthlyStockWorkbook("tồn kho mẫu mẹ", months, rows);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ton-kho-mau-me-cuoi-ky-${format(new Date(), "yyyyMMdd")}.xlsx"`,
    },
  });
}
