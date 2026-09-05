import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getWeekBuckets, getMonthBuckets, getWeekBucketsInRange, getMonthBucketsInRange, bucketIndexForDate, type WeekBucket } from "@/lib/report-utils";
import { startOfMonth, subMonths, format, isValid } from "date-fns";

const DEFAULT_HISTORY_BUCKETS = 10;

// Báo cáo "Kế hoạch vs thực tế — Cây ra rễ" (tab "Kế hoạch vs thực tế" của Admin/Admin cấp cao, và trang
// riêng /reports/rooting-plan-vs-actual cho NV Kỹ thuật — xem cùng 1 dữ liệu, không giới hạn phạm vi xem
// theo cơ sở của chính NV). Kế hoạch lấy từ RootingForecastEntry (nhiệm vụ 3 tháng/lần NV Kỹ thuật nhập,
// xem src/lib/rooting-forecast.ts) — 1 dòng taskMonth=M có quantity1/2/3 lần lượt là dự báo cho 3 tháng
// M+1/M+2/M+3, nên kế hoạch cho 1 kỳ hiển thị T phải cộng cả 3 khả năng: quantity1 của dòng taskMonth=T-1,
// quantity2 của dòng taskMonth=T-2, quantity3 của dòng taskMonth=T-3 — do các taskMonth cách nhau ĐÚNG 3
// tháng nên chỉ ĐÚNG 1 trong 3 khả năng này thực sự tồn tại dữ liệu, cộng cả 3 (mặc định 0) vẫn ra đúng
// số duy nhất. Xem theo tuần thì lấy kế hoạch THÁNG chứa tuần đó rồi chia 4. Thực tế = sản lượng thành
// phẩm (DailyRecordItem.quantityCreated, stage THANH_PHAM)
// — cùng quy ước đã có ở src/lib/production-capacity.ts (lọc theo cơ sở qua NV cấy mô đang gán
// workplaceWarehouseId đúng cơ sở đó, không có FK kho trực tiếp trên PlantingInstruction/DailyRecord).
// Query params: unit=week|month, from/to (tuỳ chọn yyyy-MM-dd, có cả 2 mới dùng quãng tự nhập),
// scope=all|warehouse, warehouseId (bắt buộc nếu scope=warehouse), plantTypeIds (danh sách id nối dấu
// phẩy, tuỳ chọn, bỏ trống = "Tất cả" — FE cho tích chọn nhiều mã cây, xem PlantTypeMultiFilter).
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (!isAdminRole(role) && role !== "KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const unit = searchParams.get("unit") === "month" ? "month" : "week";
  const scopeParam = searchParams.get("scope");
  const warehouseId = searchParams.get("warehouseId");
  const plantTypeIds = Array.from(
    new Set((searchParams.get("plantTypeIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean))
  );
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (scopeParam === "warehouse" && !warehouseId) {
    return NextResponse.json({ message: "Thiếu cơ sở sản xuất" }, { status: 400 });
  }
  const scopeWarehouseId = scopeParam === "warehouse" ? warehouseId : null;

  let buckets: WeekBucket[];
  if (fromParam && toParam) {
    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (!isValid(from) || !isValid(to)) return NextResponse.json({ message: "Quãng thời gian không hợp lệ" }, { status: 400 });
    const [start, end] = from <= to ? [from, to] : [to, from];
    buckets = unit === "month" ? getMonthBucketsInRange(start, end) : getWeekBucketsInRange(start, end);
  } else {
    buckets = unit === "month" ? getMonthBuckets(DEFAULT_HISTORY_BUCKETS) : getWeekBuckets(DEFAULT_HISTORY_BUCKETS);
  }

  // Kế hoạch — gom mọi taskMonth cần dùng (tháng chứa mỗi bucket, trừ 1/2/3 tháng — 3 khả năng vì chu kỳ
  // nhập 3 tháng/lần) rồi 1 lần groupBy, tránh query lặp lại cho từng bucket.
  const candidateTaskMonthsForBucket = buckets.map((b) => {
    const displayMonth = startOfMonth(b.start);
    return [subMonths(displayMonth, 1), subMonths(displayMonth, 2), subMonths(displayMonth, 3)];
  });
  const uniqueTaskMonths = Array.from(new Set(candidateTaskMonthsForBucket.flat().map((d) => format(d, "yyyy-MM-dd")))).map((s) => new Date(s));
  const planRows = uniqueTaskMonths.length
    ? await prisma.rootingForecastEntry.groupBy({
        by: ["taskMonth"],
        where: {
          taskMonth: { in: uniqueTaskMonths },
          ...(scopeWarehouseId ? { warehouseId: scopeWarehouseId } : {}),
          ...(plantTypeIds.length > 0 ? { plantTypeId: { in: plantTypeIds } } : {}),
        },
        _sum: { quantity1: true, quantity2: true, quantity3: true },
      })
    : [];
  const planByTaskMonth = new Map(
    planRows.map((r) => [format(r.taskMonth, "yyyy-MM-dd"), { q1: r._sum.quantity1 ?? 0, q2: r._sum.quantity2 ?? 0, q3: r._sum.quantity3 ?? 0 }])
  );

  // Thực tế + breakdown nhân sự — 1 query phủ trọn khoảng hiển thị, tự bucket + tự gộp theo staffId cùng
  // lúc (giống fetchDailyRecords/computeActualSeries ở src/lib/production-capacity.ts).
  const scopedStaffIds = scopeWarehouseId
    ? (await prisma.user.findMany({ where: { role: "CAY_MO", workplaceWarehouseId: scopeWarehouseId }, select: { id: true } })).map((s) => s.id)
    : undefined;

  const records = await prisma.dailyRecord.findMany({
    where: {
      recordDate: { gte: buckets[0].start, lte: buckets[buckets.length - 1].end },
      instruction: {
        ...(plantTypeIds.length > 0 ? { plantTypeId: { in: plantTypeIds } } : {}),
        assignedToId: scopedStaffIds ? { in: scopedStaffIds } : { not: null },
      },
    },
    select: {
      recordDate: true,
      staffId: true,
      staff: { select: { code: true, name: true } },
      items: { select: { stage: true, quantityCreated: true } },
    },
  });

  const data = buckets.map((b, i) => {
    const [t1, t2, t3] = candidateTaskMonthsForBucket[i];
    const monthPlan =
      (planByTaskMonth.get(format(t1, "yyyy-MM-dd"))?.q1 ?? 0) +
      (planByTaskMonth.get(format(t2, "yyyy-MM-dd"))?.q2 ?? 0) +
      (planByTaskMonth.get(format(t3, "yyyy-MM-dd"))?.q3 ?? 0);
    const bucketPlan = unit === "week" ? monthPlan / 4 : monthPlan;
    return { period: b.label, "Kế hoạch": Math.round(bucketPlan), "Thực tế": 0 };
  });

  const staffTotals = new Map<string, { staffId: string; code: string; name: string; actual: number }>();
  for (const r of records) {
    const finishedQty = r.items.filter((i) => i.stage === "THANH_PHAM").reduce((s, i) => s + i.quantityCreated, 0);
    if (finishedQty === 0) continue;

    const idx = bucketIndexForDate(buckets, r.recordDate);
    if (idx !== -1) data[idx]["Thực tế"] += finishedQty;

    const entry = staffTotals.get(r.staffId) ?? { staffId: r.staffId, code: r.staff.code, name: r.staff.name, actual: 0 };
    entry.actual += finishedQty;
    staffTotals.set(r.staffId, entry);
  }

  const totalPlan = data.reduce((s, d) => s + d["Kế hoạch"], 0);
  const totalActual = data.reduce((s, d) => s + d["Thực tế"], 0);
  const percentAchieved = totalPlan > 0 ? Math.round((totalActual / totalPlan) * 1000) / 10 : null;

  const staffBreakdown = Array.from(staffTotals.values())
    .map((s) => ({ ...s, percentOfPlan: totalPlan > 0 ? Math.round((s.actual / totalPlan) * 1000) / 10 : null }))
    .sort((a, b) => b.actual - a.actual);

  return NextResponse.json({ data, totalPlan, totalActual, percentAchieved, staffBreakdown });
}
