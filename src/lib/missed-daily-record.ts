import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { computeViolationPointsApplied } from "@/lib/violation-points";
import { addDays, endOfDay, format, isAfter, isBefore, startOfDay, startOfWeek, subDays } from "date-fns";

// Tự động ghi lỗi vi phạm cho NV cấy mô KHÔNG nhập dữ liệu cấy trong 1 ngày phải nhập — gắn đúng loại lỗi
// dưới đây (tìm theo label, Admin tắt loại lỗi này = tắt luôn tính năng). Không có cron trong app — gọi từ
// (dashboard)/layout.tsx, mỗi ngày chỉ thực sự quét 1 lần (xem ensureMissedDailyRecordViolations).
export const MISSED_DAILY_RECORD_VIOLATION_LABEL = "Không báo cáo/gửi số liệu tự kiểm theo thời gian hoặc hình thức đã quy định";
const CHECKED_THROUGH_KEY = "missed_daily_record_checked_through"; // yyyy-MM-dd ngày cuối đã quét xong
const MAX_CATCH_UP_DAYS = 7;

export type MissedDailyRecordDay = { staffId: string; staffCode: string; staffName: string; date: Date; instructionCode: string };

// 1 ngày D là "ngày phải nhập dữ liệu cấy" của NV S khi: D không phải Chủ nhật/ngày lễ, S có chỉ định cấy
// (không bị hủy) của ĐÚNG tuần chứa D và Kho mô đã bàn giao trước hết ngày D, và chỉ định chưa kết thúc sớm
// trước D (MOTHER_USED_UP/EARLY_END_BY_STAFF — không còn gì để cấy, lấy ngày nhật ký cuối của chỉ định làm
// mốc kết thúc vì không lưu thời điểm kết thúc). Bỏ qua ngày đã có nhật ký (bất kỳ chỉ định nào) hoặc đã
// được miễn trừ (TaskCompletionExemption). Chỉ xét NV CAY_MO đang hoạt động, đã vào làm từ trước ngày D.
export async function findMissedDailyRecordDays(from: Date, to: Date): Promise<MissedDailyRecordDay[]> {
  const rangeStart = startOfDay(from);
  const rangeEnd = endOfDay(to);
  if (isAfter(rangeStart, rangeEnd)) return [];

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true },
    select: { id: true, code: true, name: true, createdAt: true },
  });
  const staffIds = staffList.map((s) => s.id);
  if (staffIds.length === 0) return [];

  const [instructions, records, exemptions, holidays] = await Promise.all([
    prisma.plantingInstruction.findMany({
      where: {
        assignedToId: { in: staffIds },
        status: { not: "CANCELLED" },
        handedOverAt: { not: null, lte: rangeEnd },
        weekStart: { gte: subDays(startOfWeek(rangeStart, { weekStartsOn: 1 }), 1), lte: rangeEnd },
      },
      select: {
        code: true, assignedToId: true, weekStart: true, handedOverAt: true, status: true, endReason: true,
        dailyRecords: { select: { recordDate: true }, orderBy: { recordDate: "desc" }, take: 1 },
      },
    }),
    prisma.dailyRecord.findMany({
      where: { staffId: { in: staffIds }, recordDate: { gte: rangeStart, lte: rangeEnd } },
      select: { staffId: true, recordDate: true },
    }),
    prisma.taskCompletionExemption.findMany({
      where: { staffId: { in: staffIds }, date: { gte: subDays(rangeStart, 1), lte: rangeEnd } },
      select: { staffId: true, date: true },
    }),
    prisma.publicHoliday.findMany({ where: { date: { gte: subDays(rangeStart, 1), lte: rangeEnd } }, select: { date: true } }),
  ]);

  const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
  const recordKeys = new Set(records.map((r) => `${r.staffId}|${dayKey(r.recordDate)}`));
  const exemptionKeys = new Set(exemptions.map((e) => `${e.staffId}|${dayKey(e.date)}`));
  const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)));
  // weekStart lưu UTC-midnight của Thứ 2 (xem toStoredWeekStart) — so theo chuỗi ngày UTC với Thứ 2 địa phương.
  const weekKeyOfInstruction = (d: Date) => d.toISOString().slice(0, 10);

  const result: MissedDailyRecordDay[] = [];
  for (let d = rangeStart; !isAfter(d, rangeEnd); d = addDays(d, 1)) {
    if (d.getDay() === 0 || holidayKeys.has(dayKey(d))) continue;
    const weekKey = dayKey(startOfWeek(d, { weekStartsOn: 1 }));
    for (const s of staffList) {
      if (isBefore(d, startOfDay(s.createdAt))) continue;
      const key = `${s.id}|${dayKey(d)}`;
      if (recordKeys.has(key) || exemptionKeys.has(key)) continue;
      const inst = instructions.find((i) => {
        if (i.assignedToId !== s.id || !i.weekStart || weekKeyOfInstruction(i.weekStart) !== weekKey) return false;
        if (isAfter(i.handedOverAt!, endOfDay(d))) return false;
        if (i.status === "ENDED" && (i.endReason === "MOTHER_USED_UP" || i.endReason === "EARLY_END_BY_STAFF")) {
          const lastRecord = i.dailyRecords[0]?.recordDate;
          if (!lastRecord || isAfter(startOfDay(d), startOfDay(lastRecord))) return false;
        }
        return true;
      });
      if (!inst) continue;
      result.push({ staffId: s.id, staffCode: s.code, staffName: s.name, date: d, instructionCode: inst.code });
    }
  }
  return result;
}

// Ghi lỗi cho danh sách ngày đã tìm — tạo theo thứ tự thời gian để lần lặp lại trong cùng kỳ lương được
// nhân 1.5 đúng (computeViolationPointsApplied đếm theo createdAt). createdAt = 23:59 của chính ngày vi phạm
// (không phải lúc quét) để rơi đúng kỳ lương; bỏ qua nếu ngày đó NV đã có lỗi cùng loại (ghi tay hoặc lần
// quét trước) — không ghi trùng. createdById = Admin cấp cao đầu tiên (không có tài khoản "hệ thống").
export async function recordMissedDailyRecordViolations(
  days: MissedDailyRecordDay[],
  options: { notify?: boolean } = {},
): Promise<{ created: MissedDailyRecordDay[]; skipped: number }> {
  const violationType = await prisma.violationType.findFirst({
    where: { label: MISSED_DAILY_RECORD_VIOLATION_LABEL, isActive: true },
    select: { id: true, label: true, points: true },
  });
  if (!violationType || days.length === 0) return { created: [], skipped: days.length };
  const systemUser = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!systemUser) return { created: [], skipped: days.length };

  const created: MissedDailyRecordDay[] = [];
  let skipped = 0;
  for (const day of [...days].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const exists = await prisma.violationRecord.findFirst({
      where: { staffId: day.staffId, violationTypeId: violationType.id, createdAt: { gte: startOfDay(day.date), lte: endOfDay(day.date) } },
      select: { id: true },
    });
    if (exists) { skipped++; continue; }
    const at = new Date(startOfDay(day.date).getTime() + (23 * 60 + 59) * 60 * 1000);
    const pointsApplied = await computeViolationPointsApplied(day.staffId, violationType.id, violationType.points, at);
    const record = await prisma.violationRecord.create({
      data: { staffId: day.staffId, createdById: systemUser.id, violationTypeId: violationType.id, pointsApplied, createdAt: at },
    });
    created.push(day);
    if (options.notify !== false) {
      try {
        await createAlert({
          type: "NV_VIOLATION",
          title: "Bạn vừa bị ghi nhận vi phạm",
          message: `Lỗi: ${violationType.label} — không nhập dữ liệu cấy ngày ${format(day.date, "dd/MM/yyyy")} (chỉ định ${day.instructionCode})`,
          userId: day.staffId,
          relatedId: record.id,
          relatedType: "ViolationRecord",
        });
      } catch (err) {
        console.error("[missed-daily-record] Không gửi được thông báo vi phạm:", err);
      }
    }
  }
  return { created, skipped };
}

// Gọi mỗi lần render layout — chỉ thực sự quét khi chưa quét tới hôm qua (1 query/lần render khi đã quét).
// Quét bù tối đa MAX_CATCH_UP_DAYS ngày nếu nhiều ngày liền không ai mở hệ thống. "Giành quyền" quét bằng
// cách cập nhật có điều kiện mốc đã quét TRƯỚC khi quét, để 2 request cùng lúc không cùng ghi lỗi.
export async function ensureMissedDailyRecordViolations(): Promise<void> {
  const yesterday = subDays(startOfDay(new Date()), 1);
  const yesterdayKey = format(yesterday, "yyyy-MM-dd");
  const config = await prisma.systemConfig.findUnique({ where: { key: CHECKED_THROUGH_KEY } });
  if (config && config.value >= yesterdayKey) return;

  if (config) {
    const { count } = await prisma.systemConfig.updateMany({ where: { key: CHECKED_THROUGH_KEY, value: config.value }, data: { value: yesterdayKey } });
    if (count === 0) return;
  } else {
    try {
      await prisma.systemConfig.create({
        data: { key: CHECKED_THROUGH_KEY, value: yesterdayKey, description: "Ngày cuối đã tự động quét lỗi không nhập dữ liệu cấy (xem src/lib/missed-daily-record.ts)" },
      });
    } catch {
      return; // request khác vừa tạo — để nó quét
    }
  }

  const lastChecked = config ? new Date(`${config.value}T00:00:00`) : subDays(yesterday, 1);
  const from = [addDays(lastChecked, 1), subDays(yesterday, MAX_CATCH_UP_DAYS - 1)].reduce((a, b) => (isAfter(a, b) ? a : b));
  const days = await findMissedDailyRecordDays(from, yesterday);
  await recordMissedDailyRecordViolations(days);
}
