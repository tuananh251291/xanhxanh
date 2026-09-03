import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getReportMonthColumns, computeFinishedStockByFacility } from "@/lib/monthly-stock-export";
import { buildMonthlyStockWorkbook } from "@/lib/monthly-stock-workbook";
import { format } from "date-fns";

// Xuất Excel "Số tồn kho cây thành phẩm cuối kì hàng tháng, phân loại theo cơ sở" — tồn ở Phòng ra rễ
// (thành phẩm còn nằm trong kho sản xuất, TRƯỚC khi bàn giao sang Kho thành phẩm), từ tháng 7/2026 đến
// tháng hiện tại. Chỉ Admin/SUPER_ADMIN được tải.
export async function GET() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role ?? null)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const months = getReportMonthColumns();
  const rows = await computeFinishedStockByFacility(months);
  const workbook = buildMonthlyStockWorkbook("tồn kho thành phẩm", months, rows);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ton-kho-thanh-pham-cuoi-ky-${format(new Date(), "yyyyMMdd")}.xlsx"`,
    },
  });
}
