import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, parse, isValid } from "date-fns";

// Báo cáo "Dữ liệu nhật ký cấy" — Admin/Admin cấp cao + NV Kỹ thuật. Lọc theo khu sản xuất
// (User.workplaceWarehouseId của NV cấy mô), nhân sự, mã cây (lọc ở mức DailyRecordItem qua
// Lot.plantTypeId — 1 DailyRecord coi như 1 mã cây, chỉ cần CÓ dòng khớp là tính cả motherUsed của record
// đó, xem vòng lặp bên dưới), và khoảng thời gian theo TUẦN (Thứ 2 - Chủ nhật, weekStartsOn:1 — khớp quy
// ước tuần dùng chung toàn hệ thống, KHÔNG dùng số tuần ISO) hoặc THÁNG (lịch).
// - "Được cấy bao nhiêu cây" = DailyRecord.motherUsed (mẫu mẹ đưa vào cấy).
// - "Cấy ra mẫu mẹ" = DailyRecordItem.quantityCreated tổng theo stage=MAU_ME.
// - "Thành phẩm" = DailyRecordItem.quantityCreated tổng theo stage=THANH_PHAM.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") === "week" ? "week" : "month";
  const dateParam = searchParams.get("date");
  const monthParam = searchParams.get("month");
  const warehouseId = searchParams.get("warehouseId") || undefined;
  const staffId = searchParams.get("staffId") || undefined;
  const plantTypeId = searchParams.get("plantTypeId") || undefined;

  let rangeStart: Date;
  let rangeEnd: Date;
  if (mode === "week") {
    const parsedDate = dateParam ? parse(dateParam, "yyyy-MM-dd", new Date()) : new Date();
    const anchor = isValid(parsedDate) ? parsedDate : new Date();
    rangeStart = startOfWeek(anchor, { weekStartsOn: 1 });
    rangeEnd = endOfWeek(anchor, { weekStartsOn: 1 });
  } else {
    const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
    const anchor = isValid(parsedMonth) ? parsedMonth : new Date();
    rangeStart = startOfMonth(anchor);
    rangeEnd = endOfMonth(anchor);
  }

  const [records, usedPlantTypeItems] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: {
        recordDate: { gte: rangeStart, lte: rangeEnd },
        ...(staffId ? { staffId } : {}),
        staff: {
          role: "CAY_MO",
          ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}),
        },
        ...(plantTypeId ? { items: { some: { lot: { plantTypeId } } } } : {}),
      },
      select: {
        staffId: true,
        motherUsed: true,
        staff: { select: { code: true, name: true, workplaceWarehouse: { select: { name: true } } } },
        items: { select: { stage: true, quantityCreated: true, lot: { select: { plantTypeId: true } } } },
      },
    }),
    // Mã cây thực sự đã cấy trong đúng bộ lọc kho/nhân sự/thời gian này — KHÔNG lọc theo plantTypeId (mục
    // đích là cho FE biết còn những mã cây nào có thể chọn, xem PlantingLogSummaryBoard).
    prisma.dailyRecordItem.findMany({
      where: {
        dailyRecord: {
          recordDate: { gte: rangeStart, lte: rangeEnd },
          ...(staffId ? { staffId } : {}),
          staff: { role: "CAY_MO", ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}) },
        },
      },
      select: { lot: { select: { plantTypeId: true, plantType: { select: { code: true, name: true } } } } },
    }),
  ]);

  const availablePlantTypesMap = new Map<string, { code: string; name: string }>();
  for (const item of usedPlantTypeItems) {
    availablePlantTypesMap.set(item.lot.plantTypeId, { code: item.lot.plantType.code, name: item.lot.plantType.name });
  }
  const availablePlantTypes = Array.from(availablePlantTypesMap.entries())
    .map(([id, p]) => ({ id, code: p.code, name: p.name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const byStaff = new Map<string, { code: string; name: string; warehouseName: string | null; recordCount: number; motherUsed: number; motherOut: number; finishedOut: number }>();
  for (const r of records) {
    const entry = byStaff.get(r.staffId) ?? {
      code: r.staff.code, name: r.staff.name, warehouseName: r.staff.workplaceWarehouse?.name ?? null,
      recordCount: 0, motherUsed: 0, motherOut: 0, finishedOut: 0,
    };
    entry.recordCount += 1;
    entry.motherUsed += r.motherUsed;
    for (const item of r.items) {
      if (plantTypeId && item.lot.plantTypeId !== plantTypeId) continue;
      if (item.stage === "MAU_ME") entry.motherOut += item.quantityCreated;
      else entry.finishedOut += item.quantityCreated;
    }
    byStaff.set(r.staffId, entry);
  }

  const rows = Array.from(byStaff.entries())
    .map(([staffId, e]) => ({
      staffId, staffCode: e.code, staffName: e.name, warehouseName: e.warehouseName,
      recordCount: e.recordCount, motherUsed: e.motherUsed, motherOut: e.motherOut, finishedOut: e.finishedOut,
    }))
    .sort((a, b) => b.motherUsed - a.motherUsed || a.staffName.localeCompare(b.staffName));

  const summary = {
    staffCount: rows.length,
    totalMotherUsed: rows.reduce((s, r) => s + r.motherUsed, 0),
    totalMotherOut: rows.reduce((s, r) => s + r.motherOut, 0),
    totalFinishedOut: rows.reduce((s, r) => s + r.finishedOut, 0),
  };

  return NextResponse.json({ rangeStart, rangeEnd, rows, summary, availablePlantTypes });
}
