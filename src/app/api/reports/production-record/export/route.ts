import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { computeProductionRecordForPeriod } from "@/lib/production-record-report";
import { buildProductionRecordWorkbook } from "@/lib/production-record-workbook";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const warehouseId = role === "KY_THUAT" ? session!.user.workplaceWarehouseId ?? undefined : searchParams.get("warehouseId") || undefined;

  const result = await computeProductionRecordForPeriod(monthParam, warehouseId);
  const workbook = buildProductionRecordWorkbook(result);
  const buffer = await workbook.xlsx.writeBuffer();

  const monthLabel = monthParam ?? format(new Date(), "yyyy-MM");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="so-luong-ghi-nhan-${monthLabel}-${format(new Date(), "yyyyMMdd")}.xlsx"`,
    },
  });
}
