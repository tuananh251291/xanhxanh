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
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

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
  // NV Kỹ thuật/Kho mô chỉ xem được đúng khu sản xuất mình đang làm việc — ép cứng ở server, bỏ qua scope/
  // warehouseId client gửi lên (Admin/Admin cấp cao vẫn xem toàn hệ thống hoặc chọn cơ sở bất kỳ như cũ).
  const scopeWarehouseId =
    role === "KY_THUAT" || role === "KHO_MO" ? session!.user.workplaceWarehouseId ?? null : scopeParam === "warehouse" ? warehouseId : null;

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
  // nhập 3 tháng/lần) rồi 1 lần findMany, tránh query lặp lại cho từng bucket. Lấy findMany (không groupBy
  // nữa) vì còn cần tách riêng theo (assignedStaffId, plantTypeId) cho "Chi tiết theo nhân sự" bên dưới —
  // 1 NV cấy mô có thể được giao nhiều mã cây khác nhau (nhiều dòng RootingForecastEntry cùng
  // assignedStaffId, khác plantTypeId — xem @@unique ở schema.prisma), phải tách riêng từng mã cây, KHÔNG
  // gộp chung thành 1 dòng "kế hoạch tổng" của NV đó (dễ hiểu sai % đáp ứng khi NV làm nhiều mã cây có tiến
  // độ khác nhau).
  const candidateTaskMonthsForBucket = buckets.map((b) => {
    const displayMonth = startOfMonth(b.start);
    return [subMonths(displayMonth, 1), subMonths(displayMonth, 2), subMonths(displayMonth, 3)];
  });
  const uniqueTaskMonths = Array.from(new Set(candidateTaskMonthsForBucket.flat().map((d) => format(d, "yyyy-MM-dd")))).map((s) => new Date(s));
  const planEntries = uniqueTaskMonths.length
    ? await prisma.rootingForecastEntry.findMany({
        where: {
          taskMonth: { in: uniqueTaskMonths },
          ...(scopeWarehouseId ? { warehouseId: scopeWarehouseId } : {}),
          ...(plantTypeIds.length > 0 ? { plantTypeId: { in: plantTypeIds } } : {}),
        },
        select: { taskMonth: true, assignedStaffId: true, plantTypeId: true, quantity1: true, quantity2: true, quantity3: true },
      })
    : [];

  type PlanAgg = { q1: number; q2: number; q3: number };
  const emptyPlanMap = new Map<string, PlanAgg>();
  const planByTaskMonth = new Map<string, PlanAgg>();
  // Key "staffId|plantTypeId" — tách riêng kế hoạch từng mã cây trong phần việc của 1 NV, xem comment trên.
  const planByStaffPlantTaskMonth = new Map<string, Map<string, PlanAgg>>();
  for (const p of planEntries) {
    const key = format(p.taskMonth, "yyyy-MM-dd");
    const total = planByTaskMonth.get(key) ?? { q1: 0, q2: 0, q3: 0 };
    total.q1 += p.quantity1; total.q2 += p.quantity2; total.q3 += p.quantity3;
    planByTaskMonth.set(key, total);

    const staffPlantKey = `${p.assignedStaffId}|${p.plantTypeId}`;
    const staffMap = planByStaffPlantTaskMonth.get(staffPlantKey) ?? new Map<string, PlanAgg>();
    const staffAgg = staffMap.get(key) ?? { q1: 0, q2: 0, q3: 0 };
    staffAgg.q1 += p.quantity1; staffAgg.q2 += p.quantity2; staffAgg.q3 += p.quantity3;
    staffMap.set(key, staffAgg);
    planByStaffPlantTaskMonth.set(staffPlantKey, staffMap);
  }

  // Cộng kế hoạch (theo taskMonth candidate ở 1 map bất kỳ — dùng chung cho cả tổng hệ thống lẫn từng NV)
  // trên TOÀN kỳ đang hiển thị — cùng công thức chia 4 cho tuần như "data" bên dưới, để % đáp ứng theo NV
  // so đúng cùng đơn vị với % đạt tổng.
  const sumPlanOverBuckets = (planMap: Map<string, PlanAgg>): number => {
    let total = 0;
    for (const [t1, t2, t3] of candidateTaskMonthsForBucket) {
      const monthPlan =
        (planMap.get(format(t1, "yyyy-MM-dd"))?.q1 ?? 0) +
        (planMap.get(format(t2, "yyyy-MM-dd"))?.q2 ?? 0) +
        (planMap.get(format(t3, "yyyy-MM-dd"))?.q3 ?? 0);
      total += unit === "week" ? monthPlan / 4 : monthPlan;
    }
    return Math.round(total);
  };

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
      instruction: { select: { plantType: { select: { id: true, code: true, name: true } } } },
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

  // Key "staffId|plantTypeId" — 1 NV cấy mô nhiều mã cây thì tách riêng từng mã, không gộp chung 1 dòng.
  const staffPlantTotals = new Map<
    string,
    { staffId: string; code: string; name: string; plantTypeId: string; plantTypeCode: string; plantTypeName: string; actual: number }
  >();
  for (const r of records) {
    const finishedQty = r.items.filter((i) => i.stage === "THANH_PHAM").reduce((s, i) => s + i.quantityCreated, 0);
    if (finishedQty === 0) continue;

    const idx = bucketIndexForDate(buckets, r.recordDate);
    if (idx !== -1) data[idx]["Thực tế"] += finishedQty;

    const plantType = r.instruction.plantType;
    const key = `${r.staffId}|${plantType.id}`;
    const entry = staffPlantTotals.get(key) ?? {
      staffId: r.staffId, code: r.staff.code, name: r.staff.name,
      plantTypeId: plantType.id, plantTypeCode: plantType.code, plantTypeName: plantType.name,
      actual: 0,
    };
    entry.actual += finishedQty;
    staffPlantTotals.set(key, entry);
  }

  const totalPlan = data.reduce((s, d) => s + d["Kế hoạch"], 0);
  const totalActual = data.reduce((s, d) => s + d["Thực tế"], 0);
  const percentAchieved = totalPlan > 0 ? Math.round((totalActual / totalPlan) * 1000) / 10 : null;

  // % đáp ứng theo NV+mã cây = thực tế của ĐÚNG NV+mã cây đó / kế hoạch ĐÃ GIAO CHO ĐÚNG NV+mã cây đó
  // (assignedStaffId + plantTypeId ở RootingForecastEntry) — KHÔNG phải chia cho totalPlan chung của cả kỳ,
  // cũng KHÔNG gộp các mã cây khác nhau của cùng 1 NV vào 1 kế hoạch chung (1 NV làm nhiều mã cây có tiến
  // độ khác nhau, gộp lại sẽ che mất mã nào đang chậm).
  const staffBreakdown = Array.from(staffPlantTotals.values())
    .map((s) => {
      const plan = sumPlanOverBuckets(planByStaffPlantTaskMonth.get(`${s.staffId}|${s.plantTypeId}`) ?? emptyPlanMap);
      return { ...s, plan, percentOfPlan: plan > 0 ? Math.round((s.actual / plan) * 1000) / 10 : null };
    })
    .sort((a, b) => b.actual - a.actual);

  return NextResponse.json({ data, totalPlan, totalActual, percentAchieved, staffBreakdown });
}
