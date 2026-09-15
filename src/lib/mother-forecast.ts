import { format, addMonths, getDay, addDays, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import type { Prisma } from "@prisma/client";

// Nhiệm vụ "Dự kiến đáp ứng mẫu mẹ" cho NV Kỹ thuật — CÙNG cơ chế "Dự kiến đáp ứng cây ra rễ"
// (src/lib/rooting-forecast.ts): mỗi cơ sở sản xuất có 1 vòng nhập liệu mỗi 3 THÁNG, NV tự nhập từng dòng
// (mã cây, NV cấy mô, quantity1/2/3 = số mẫu mẹ dự kiến đáp ứng cho LẦN LƯỢT 3 THÁNG KẾ TIẾP taskMonth).
// NỘP 1 LẦN DUY NHẤT cho cả lộ trình 3 tháng — sau khi nộp (MotherForecastSubmission tồn tại) thì KHOÁ
// CỨNG, chỉ còn sửa được qua MotherForecastEditProposal (Admin kỹ thuật/Admin cấp cao duyệt).
//
// KHÁC rooting-forecast: có thêm computeMotherShortfallRows/ensureMotherOutputShortfallAlerts — so sản
// lượng mẫu mẹ THỰC TẾ đã cấy trong THÁNG HIỆN TẠI (không phải taskMonth tương lai) với đúng kế hoạch của
// tháng đó (suy ra từ quantity1/2/3 của các dòng taskMonth trước — xem resolveMonthlyPlan), cảnh báo nếu
// tụt dưới 90% so với tiến độ ngày làm việc đã qua.
//
// Epoch chu kỳ RIÊNG (không dùng chung ROOTING_FORECAST_CYCLE_EPOCH) — đặt ở tháng hiện tại lúc triển khai
// tính năng này để lộ trình đầu tiên mở được ngay, không phải chờ tới chu kỳ 3 tháng kế tiếp.
const MOTHER_FORECAST_CYCLE_EPOCH = new Date(2026, 8, 1);

export function getTaskMonth(date: Date = new Date()): Date {
  let candidate = new Date(format(MOTHER_FORECAST_CYCLE_EPOCH, "yyyy-MM-dd"));
  while (true) {
    const next = addMonths(candidate, 3);
    if (date.getTime() < getForecastOpensAt(next).getTime()) break;
    candidate = next;
  }
  return candidate;
}

export function getForecastOpensAt(taskMonth: Date): Date {
  return new Date(taskMonth.getFullYear(), taskMonth.getMonth(), 5);
}

export function getForecastDeadline(taskMonth: Date): Date {
  const day15 = new Date(taskMonth.getFullYear(), taskMonth.getMonth(), 15);
  return getDay(day15) === 0 ? addDays(day15, 1) : day15;
}

export function getForecastTargetMonths(taskMonth: Date): [Date, Date, Date] {
  return [addMonths(taskMonth, 1), addMonths(taskMonth, 2), addMonths(taskMonth, 3)];
}

export async function getAvailableStaff(warehouseId: string): Promise<{ id: string; code: string; name: string }[]> {
  return prisma.user.findMany({
    where: { role: "CAY_MO", workplaceWarehouseId: warehouseId, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}

// Upsert dùng chung cho cả bước nộp lần đầu lẫn bước Admin duyệt đề xuất chỉnh sửa — mirror
// applyForecastEntry ở src/lib/rooting-forecast.ts.
export async function applyForecastEntry(
  tx: Prisma.TransactionClient,
  params: {
    warehouseId: string; plantTypeId: string; taskMonth: Date; assignedStaffId: string;
    quantity1: number; quantity2: number; quantity3: number; enteredById: string;
  }
) {
  const { warehouseId, plantTypeId, taskMonth, assignedStaffId, quantity1, quantity2, quantity3, enteredById } = params;
  await tx.motherForecastEntry.upsert({
    where: { warehouseId_plantTypeId_taskMonth_assignedStaffId: { warehouseId, plantTypeId, taskMonth, assignedStaffId } },
    create: { warehouseId, plantTypeId, taskMonth, assignedStaffId, quantity1, quantity2, quantity3, enteredById },
    update: { quantity1, quantity2, quantity3, enteredById, enteredAt: new Date() },
  });
}

export type ForecastEntryRow = {
  entryId: string;
  plantTypeId: string; plantTypeCode: string; plantTypeName: string;
  assignedStaffId: string; staffCode: string; staffName: string;
  quantity1: number; quantity2: number; quantity3: number;
};
export type ForecastStatus = {
  taskMonth: Date;
  targetMonths: [Date, Date, Date];
  deadline: Date;
  entries: ForecastEntryRow[];
  availableStaff: { id: string; code: string; name: string }[];
  isLocked: boolean;
  isComplete: boolean;
  completedAt: Date | null;
  isOnTime: boolean | null;
};

export async function getForecastStatus(warehouseId: string, taskMonth: Date): Promise<ForecastStatus> {
  const [entries, availableStaff, submission] = await Promise.all([
    prisma.motherForecastEntry.findMany({
      where: { warehouseId, taskMonth },
      select: {
        id: true, plantTypeId: true, quantity1: true, quantity2: true, quantity3: true, assignedStaffId: true,
        plantType: { select: { code: true, name: true } },
        assignedStaff: { select: { code: true, name: true } },
      },
      orderBy: { plantType: { code: "asc" } },
    }),
    getAvailableStaff(warehouseId),
    prisma.motherForecastSubmission.findUnique({ where: { warehouseId_taskMonth: { warehouseId, taskMonth } } }),
  ]);

  const rows: ForecastEntryRow[] = entries.map((e) => ({
    entryId: e.id,
    plantTypeId: e.plantTypeId, plantTypeCode: e.plantType.code, plantTypeName: e.plantType.name,
    assignedStaffId: e.assignedStaffId, staffCode: e.assignedStaff.code, staffName: e.assignedStaff.name,
    quantity1: e.quantity1, quantity2: e.quantity2, quantity3: e.quantity3,
  }));

  const isLocked = !!submission;
  const completedAt = submission?.submittedAt ?? null;
  const deadline = getForecastDeadline(taskMonth);
  const isOnTime = completedAt ? completedAt.getTime() <= deadline.getTime() : null;

  return {
    taskMonth, targetMonths: getForecastTargetMonths(taskMonth), deadline,
    entries: rows, availableStaff, isLocked, isComplete: isLocked, completedAt, isOnTime,
  };
}

// Gọi lazy từ layout (giống ensureRootingForecastReminder) — gửi thông báo nhiệm vụ mở, chưa nộp.
export async function ensureMotherForecastReminder(warehouseId: string | null): Promise<void> {
  if (!warehouseId) return;
  const taskMonth = getTaskMonth();
  if (new Date() < getForecastOpensAt(taskMonth)) return;

  const status = await getForecastStatus(warehouseId, taskMonth);
  if (status.isLocked) return;

  const relatedId = `mother-forecast:${warehouseId}:${format(taskMonth, "yyyy-MM-dd")}`;
  const alreadySent = await prisma.alert.findFirst({ where: { type: "MOTHER_FORECAST_MONTHLY_DUE", relatedId } });
  if (alreadySent) return;

  const [m1, m2, m3] = status.targetMonths;
  const monthsLabel = [m1, m2, m3].map((m) => format(m, "MM/yyyy")).join(", ");

  const staff = await prisma.user.findMany({
    where: { role: "KY_THUAT", workplaceWarehouseId: warehouseId, isActive: true },
    select: { id: true },
  });
  for (const s of staff) {
    await createAlert({
      type: "MOTHER_FORECAST_MONTHLY_DUE",
      title: "Nhiệm vụ mới: Dự kiến đáp ứng mẫu mẹ",
      message: `Cần nộp số mẫu mẹ dự kiến đáp ứng cho 3 tháng tới (${monthsLabel}) trước ${format(status.deadline, "dd/MM/yyyy")}.`,
      userId: s.id,
      relatedId,
      relatedType: "MotherForecastEntry",
    });
  }
}

export type MotherShortfallRow = {
  plantTypeId: string; plantTypeCode: string; plantTypeName: string;
  assignedStaffId: string; staffCode: string; staffName: string;
  monthlyPlanQuantity: number;
  workingDaysInMonth: number;
  workingDaysElapsed: number;
  requiredToDateQuantity: number;
  actualQuantity: number;
  achievedPct: number; // 0-100+, làm tròn 1 chữ số thập phân
};

// So sản lượng mẫu mẹ THỰC TẾ tháng hiện tại (tính tới HẾT HÔM NAY) với kế hoạch tháng đó, theo ĐÚNG từng
// dòng (mã cây, NV cấy mô) — trả về các dòng có kế hoạch > 0 và đạt < 90%. "Đến hết ngày hiện tại" (khác
// rooting-target.ts tính tới hết HÔM QUA) theo đúng yêu cầu: ngày làm việc đã qua BAO GỒM hôm nay.
export async function computeMotherShortfallRows(warehouseId: string): Promise<MotherShortfallRow[]> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const todayEnd = now;

  const monthStartUtcMidnight = new Date(format(monthStart, "yyyy-MM-dd"));
  const t1 = addMonths(monthStartUtcMidnight, -1);
  const t2 = addMonths(monthStartUtcMidnight, -2);
  const t3 = addMonths(monthStartUtcMidnight, -3);

  const [planRows, holidays] = await Promise.all([
    // Chỉ định DỰ PHÒNG không tính vào kế hoạch — nhưng MotherForecastEntry vốn không phân biệt nguồn chỉ
    // định (là số KY_THUAT tự khai, không suy từ chỉ định), nên không cần lọc gì thêm ở đây; điều kiện
    // "không tính dự phòng" áp dụng cho phần THỰC TẾ (producedItems) bên dưới.
    prisma.motherForecastEntry.findMany({
      where: { warehouseId, taskMonth: { in: [t1, t2, t3] } },
      select: {
        plantTypeId: true, assignedStaffId: true, taskMonth: true, quantity1: true, quantity2: true, quantity3: true,
        plantType: { select: { code: true, name: true } },
        assignedStaff: { select: { code: true, name: true } },
      },
    }),
    prisma.publicHoliday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
  ]);
  if (planRows.length === 0) return [];

  const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
  const holidayDayKeys = new Set(holidays.map((h) => dayKey(h.date)));
  const isWorkingDay = (d: Date) => d.getDay() !== 0 && !holidayDayKeys.has(dayKey(d));
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const workingDaysInMonth = daysInMonth.filter(isWorkingDay).length;
  const workingDaysElapsed = eachDayOfInterval({ start: monthStart, end: todayEnd })
    .filter((d) => d <= monthEnd)
    .filter(isWorkingDay).length;

  // Gộp kế hoạch theo (plantTypeId, assignedStaffId) — mỗi dòng chỉ ĐÚNG 1 trong 3 taskMonth thực sự có
  // dữ liệu khớp (cách nhau đúng 3 tháng), cộng cả quantity1(t1)/quantity2(t2)/quantity3(t3) vẫn ra đúng 1
  // số duy nhất — cùng cách resolve ở /api/reports/rooting-plan-vs-actual.
  type PlanKey = string;
  const planByKey = new Map<PlanKey, { plantTypeId: string; plantTypeCode: string; plantTypeName: string; assignedStaffId: string; staffCode: string; staffName: string; quantity: number }>();
  for (const r of planRows) {
    const key = `${r.plantTypeId}::${r.assignedStaffId}`;
    const contributed = dayKey(r.taskMonth) === dayKey(t1) ? r.quantity1 : dayKey(r.taskMonth) === dayKey(t2) ? r.quantity2 : dayKey(r.taskMonth) === dayKey(t3) ? r.quantity3 : 0;
    if (contributed <= 0) continue;
    const existing = planByKey.get(key);
    if (existing) {
      existing.quantity += contributed;
    } else {
      planByKey.set(key, {
        plantTypeId: r.plantTypeId, plantTypeCode: r.plantType.code, plantTypeName: r.plantType.name,
        assignedStaffId: r.assignedStaffId, staffCode: r.assignedStaff.code, staffName: r.assignedStaff.name,
        quantity: contributed,
      });
    }
  }
  if (planByKey.size === 0) return [];

  // Thực tế — TÍNH HẾT (kể cả chỉ định dự phòng đã dùng), lọc theo đúng (plantTypeId, staffId) của từng
  // dòng kế hoạch, trong tháng tới NGAY BÂY GIỜ.
  const staffIds = Array.from(new Set(Array.from(planByKey.values()).map((p) => p.assignedStaffId)));
  const plantTypeIds = Array.from(new Set(Array.from(planByKey.values()).map((p) => p.plantTypeId)));
  const records = await prisma.dailyRecord.findMany({
    where: {
      staffId: { in: staffIds },
      recordDate: { gte: monthStart, lte: todayEnd },
      instruction: { plantTypeId: { in: plantTypeIds } },
    },
    select: {
      staffId: true,
      instruction: { select: { plantTypeId: true } },
      items: { select: { stage: true, quantityCreated: true } },
    },
  });
  const actualByKey = new Map<PlanKey, number>();
  for (const r of records) {
    const key = `${r.instruction.plantTypeId}::${r.staffId}`;
    const motherQty = r.items.filter((i) => i.stage === "MAU_ME").reduce((s, i) => s + i.quantityCreated, 0);
    actualByKey.set(key, (actualByKey.get(key) ?? 0) + motherQty);
  }

  const rows: MotherShortfallRow[] = [];
  for (const [key, plan] of planByKey) {
    const dailyTarget = workingDaysInMonth > 0 ? plan.quantity / workingDaysInMonth : 0;
    const requiredToDateQuantity = dailyTarget * workingDaysElapsed;
    const actualQuantity = actualByKey.get(key) ?? 0;
    if (requiredToDateQuantity <= 0) continue;
    const achievedPct = (actualQuantity / requiredToDateQuantity) * 100;
    if (achievedPct >= 90) continue;
    rows.push({
      plantTypeId: plan.plantTypeId, plantTypeCode: plan.plantTypeCode, plantTypeName: plan.plantTypeName,
      assignedStaffId: plan.assignedStaffId, staffCode: plan.staffCode, staffName: plan.staffName,
      monthlyPlanQuantity: plan.quantity,
      workingDaysInMonth, workingDaysElapsed,
      requiredToDateQuantity: Math.round(requiredToDateQuantity),
      actualQuantity,
      achievedPct: Math.round(achievedPct * 10) / 10,
    });
  }
  return rows.sort((a, b) => a.achievedPct - b.achievedPct);
}

// Gọi lazy từ layout — với mỗi dòng tụt dưới 90%, báo NV Kỹ thuật (người lập kế hoạch, KHÔNG phải NV cấy
// mô ở dòng đó) đang làm ở đúng cơ sở này, 1 lần duy nhất/dòng/tháng (dedupe qua relatedId). Admin kỹ
// thuật/Admin cấp cao xem qua widget Dashboard (ADMIN_DASHBOARD_ALERT_TYPES), không nhận alert cá nhân ở
// đây — xem comment AlertType.MOTHER_OUTPUT_SHORTFALL.
export async function ensureMotherOutputShortfallAlerts(warehouseId: string | null): Promise<void> {
  if (!warehouseId) return;
  const shortfallRows = await computeMotherShortfallRows(warehouseId);
  if (shortfallRows.length === 0) return;

  const monthKey = format(new Date(), "yyyy-MM");
  const kyThuatStaff = await prisma.user.findMany({
    where: { role: "KY_THUAT", workplaceWarehouseId: warehouseId, isActive: true },
    select: { id: true },
  });
  if (kyThuatStaff.length === 0) return;

  for (const row of shortfallRows) {
    const relatedId = `mother-shortfall:${warehouseId}:${row.plantTypeId}:${row.assignedStaffId}:${monthKey}`;
    const alreadySent = await prisma.alert.findFirst({ where: { type: "MOTHER_OUTPUT_SHORTFALL", relatedId } });
    if (alreadySent) continue;

    const message = `${row.plantTypeCode} — NV cấy mô ${row.staffName}: thực tế ${row.actualQuantity.toLocaleString("vi-VN")} / cần đạt ${row.requiredToDateQuantity.toLocaleString("vi-VN")} cụm tính đến hôm nay (đạt ${row.achievedPct}%, kế hoạch tháng ${row.monthlyPlanQuantity.toLocaleString("vi-VN")} cụm).`;
    for (const s of kyThuatStaff) {
      await createAlert({
        type: "MOTHER_OUTPUT_SHORTFALL",
        title: "Sản lượng mẫu mẹ tụt dưới 90% kế hoạch",
        message,
        userId: s.id,
        relatedId,
        relatedType: "MotherForecastEntry",
      });
    }
  }
}
