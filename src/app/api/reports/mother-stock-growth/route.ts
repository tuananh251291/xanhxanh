import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { isoWeekStringToMonday } from "@/lib/week-rotation";
import { computeMotherStockGrowth } from "@/lib/mother-stock-growth-report";

// Báo cáo "Số lượng mẫu mẹ gia tăng" (Admin, xem report-center). Query params: warehouseId (bắt buộc, 1 kho
// sản xuất), plantTypeId (tuỳ chọn — bỏ trống = "Tất cả", trả về theo từng mã cây), fromWeek/toWeek
// (bắt buộc, "YYYY-Www" từ input type="week" — tuần n và tuần n+x của khoảng đang xem).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const plantTypeId = searchParams.get("plantTypeId") || null;
  const fromWeek = searchParams.get("fromWeek");
  const toWeek = searchParams.get("toWeek");

  if (!warehouseId) return NextResponse.json({ message: "Thiếu cơ sở sản xuất" }, { status: 400 });
  if (!fromWeek || !toWeek) return NextResponse.json({ message: "Thiếu khoảng tuần" }, { status: 400 });

  const fromMonday = isoWeekStringToMonday(fromWeek);
  const toMonday = isoWeekStringToMonday(toWeek);
  if (!fromMonday || !toMonday) return NextResponse.json({ message: "Khoảng tuần không hợp lệ" }, { status: 400 });

  const [weekNStart, weekNPlusXStart] = fromMonday <= toMonday ? [fromMonday, toMonday] : [toMonday, fromMonday];

  const rows = await computeMotherStockGrowth(warehouseId, plantTypeId, weekNStart, weekNPlusXStart);
  return NextResponse.json({ rows });
}
