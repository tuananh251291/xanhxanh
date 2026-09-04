import { prisma } from "@/lib/prisma";
import { getInspectionDueAt } from "@/lib/inspection";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { MIN_BACKUP_INSTRUCTION_COUNT } from "@/types";
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, addDays, addWeeks, isSameDay, format, isBefore, isAfter,
} from "date-fns";

// Báo cáo "Số ngày không hoàn thành nhiệm vụ" cho Admin + Kho mô — tính lại từ dữ liệu giao dịch gốc
// (DailyRecord/Transfer/PlantingInstruction/MotherPhoto/ChecklistItem), KHÔNG dùng hệ thống Checklist
// chung (ChecklistTemplate) vì đó là các đầu việc Admin tự soạn thủ công, khác với nhiệm vụ thật hiện
// trên Dashboard từng vai trò (xem getCayMoStats/getKyThuatStats/getKhoMoDailyStats+WeeklyStats ở
// src/app/(dashboard)/dashboard/page.tsx — logic bên dưới cố tình mô phỏng lại đúng các nhiệm vụ đó,
// nhưng có thể đánh giá cho 1 NGÀY/TUẦN BẤT KỲ trong quá khứ thay vì chỉ "hôm nay").
//
// Nguyên tắc chung đã chốt với người dùng: nhiệm vụ nào tái tạo được từ dữ liệu có mốc thời gian lưu sẵn
// (DailyRecord.recordDate, Transfer.createdAt/confirmedAt, PlantingInstruction.createdAt/handedOverAt,
// MotherPhoto.weekStart, ChecklistItem.assignedDate/completed) thì tính cho MỌI ngày/tuần yêu cầu. Nhiệm
// vụ nào chỉ là "trạng thái tức thời" (không lưu lại đã quá hạn từ lúc nào — VD còn lô nhiễm phòng tối
// chưa kiểm tra, còn tồn Phòng nhiễm chưa xử lý) thì CHỈ đánh giá cho tuần hiện tại (đúng hôm nay), bỏ
// qua khi tính các tuần đã qua — không suy diễn gần đúng.

export type TaskCompletionDay = {
  date: string; // yyyy-MM-dd
  missedTasks: string[];
  completedTasks: string[];
  exempted: boolean;
  exemptionReason: string | null;
};

// 1 đầu việc được đánh giá trong ngày/hạn đó, kèm đã xong hay chưa — dùng để build cả missedTasks lẫn
// completedTasks (xem buildDay) mà không phải lặp lại điều kiện 2 lần.
type EvaluatedTask = { title: string; done: boolean };

export type TaskCompletionStaffRow = {
  staffId: string;
  staffCode: string;
  staffName: string;
  role: "KY_THUAT" | "CAY_MO" | "KHO_MO";
  notCompletedCount: number;
  days: TaskCompletionDay[];
};

type ExemptionMap = Map<string, string>; // key `${staffId}|yyyy-MM-dd` -> reason

function exemptionKey(staffId: string, date: Date): string {
  return `${staffId}|${format(date, "yyyy-MM-dd")}`;
}

async function loadExemptions(staffIds: string[], weekStart: Date, weekEnd: Date): Promise<ExemptionMap> {
  if (staffIds.length === 0) return new Map();
  const rows = await prisma.taskCompletionExemption.findMany({
    where: { staffId: { in: staffIds }, date: { gte: weekStart, lte: weekEnd } },
  });
  return new Map(rows.map((r) => [exemptionKey(r.staffId, r.date), r.reason]));
}

function buildDay(date: Date, evaluated: EvaluatedTask[], exemptions: ExemptionMap, staffId: string): TaskCompletionDay {
  const reason = exemptions.get(exemptionKey(staffId, date)) ?? null;
  return {
    date: format(date, "yyyy-MM-dd"),
    missedTasks: evaluated.filter((t) => !t.done).map((t) => t.title),
    completedTasks: evaluated.filter((t) => t.done).map((t) => t.title),
    exempted: reason !== null,
    exemptionReason: reason,
  };
}

function countNotCompleted(days: TaskCompletionDay[]): number {
  return days.filter((d) => d.missedTasks.length > 0 && !d.exempted).length;
}

// ============================================================
// CAY_MO — nhịp hàng ngày
// ============================================================
async function buildCayMoRows(
  weekStart: Date, evalEnd: Date, isCurrentWeek: boolean, workplaceWarehouseId: string | null,
): Promise<TaskCompletionStaffRow[]> {
  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true, ...(workplaceWarehouseId ? { workplaceWarehouseId } : {}) },
    select: { id: true, code: true, name: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  if (staffList.length === 0) return [];
  const staffIds = staffList.map((s) => s.id);
  const today = startOfDay(new Date());

  const [dailyRecords, handovers, exemptions, overdueLots] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { staffId: { in: staffIds }, recordDate: { gte: weekStart, lte: evalEnd } },
      select: { staffId: true, recordDate: true },
    }),
    prisma.transfer.findMany({
      where: { fromUserId: { in: staffIds }, fromRoom: { type: "PHONG_TOI" }, createdAt: { gte: weekStart, lte: evalEnd } },
      select: { fromUserId: true, createdAt: true },
    }),
    loadExemptions(staffIds, weekStart, evalEnd),
    // "Kiểm tra nhiễm phòng tối" là trạng thái tức thời — chỉ đánh giá được cho đúng hôm nay (xem
    // nguyên tắc chung ở đầu file), không tái tạo cho ngày quá khứ.
    isCurrentWeek
      ? prisma.lot.findMany({
          where: { status: "ACTIVE", instruction: { assignedToId: { in: staffIds } }, inspectedAt: null, room: { type: "PHONG_TOI" } },
          select: { enteredAt: true, instruction: { select: { assignedToId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const now = new Date();
  const overdueStaffIds = new Set(
    overdueLots
      .filter((l) => getInspectionDueAt(l.enteredAt) <= now)
      .map((l) => l.instruction?.assignedToId)
      .filter((id): id is string => !!id)
  );

  return staffList.map((staff) => {
    const days: TaskCompletionDay[] = [];
    for (let d = weekStart; !isAfter(d, evalEnd); d = addDays(d, 1)) {
      if (isBefore(d, startOfDay(staff.createdAt))) continue; // chưa vào làm ngày đó
      const evaluated: EvaluatedTask[] = [
        { title: "Cập nhật số liệu cấy", done: dailyRecords.some((r) => r.staffId === staff.id && isSameDay(r.recordDate, d)) },
        { title: "Bàn giao sản phẩm", done: handovers.some((t) => t.fromUserId === staff.id && isSameDay(t.createdAt, d)) },
      ];
      if (isSameDay(d, today)) evaluated.push({ title: "Kiểm tra nhiễm phòng tối", done: !overdueStaffIds.has(staff.id) });
      days.push(buildDay(d, evaluated, exemptions, staff.id));
    }
    return {
      staffId: staff.id, staffCode: staff.code, staffName: staff.name, role: "CAY_MO" as const,
      notCompletedCount: countNotCompleted(days), days,
    };
  });
}

// ============================================================
// KY_THUAT — nhịp tuần, quy đổi về "ngày hạn chót" (Thứ 3 / Thứ 5 / Chủ nhật)
// ============================================================
async function buildKyThuatRows(weekStart: Date, weekEnd: Date, evalEnd: Date): Promise<TaskCompletionStaffRow[]> {
  // NV kỹ thuật không gán workplaceWarehouseId (luôn làm việc ở mọi kho) — hiện đủ cho mọi người xem
  // báo cáo (Admin lẫn Kho mô), không lọc theo kho.
  const staffList = await prisma.user.findMany({
    where: { role: "KY_THUAT", isActive: true },
    select: { id: true, code: true, name: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  if (staffList.length === 0) return [];
  const staffIds = staffList.map((s) => s.id);

  const thursdayDeadline = addDays(weekStart, 3);
  const tuesdayDeadline = addDays(weekStart, 1);
  const sundayDeadline = weekEnd;

  const exemptions = await loadExemptions(staffIds, weekStart, evalEnd);

  const [myInstructionsAll, dueMotherLots, backupInstructions, motherPhotosThisWeek, activeMotherPlantTypes] = await Promise.all([
    prisma.plantingInstruction.findMany({ where: { createdById: { in: staffIds } }, select: { id: true, createdById: true } }),
    prisma.lot.findMany({
      where: { stage: "MAU_ME", status: "ACTIVE", expectedMoveAt: { lte: thursdayDeadline }, instruction: { createdById: { in: staffIds } } },
      select: { id: true, instruction: { select: { createdById: true } } },
    }),
    prisma.plantingInstruction.findMany({
      where: { createdById: { in: staffIds }, isBackup: true, weekStart: toStoredWeekStart(addWeeks(weekStart, 1)) },
      select: { createdById: true },
    }),
    prisma.motherPhoto.findMany({
      where: { takenById: { in: staffIds }, weekStart: toStoredWeekStart(weekStart) },
      select: { takenById: true, plantTypeId: true },
    }),
    // Xấp xỉ: dùng danh sách loại cây có kệ mẫu mẹ ĐANG gán NV hiện tại làm mẫu số — không tái tạo được
    // chính xác danh sách này tại thời điểm tuần đã qua (không lưu lịch sử gán kệ theo tuần).
    prisma.lot.findMany({
      where: { stage: "MAU_ME", status: "ACTIVE", quantity: { gt: 0 }, shelf: { assignedStaffId: { not: null } } },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
  ]);

  const dueLotIdsByStaff = new Map<string, string[]>();
  for (const lot of dueMotherLots) {
    const cid = lot.instruction?.createdById;
    if (!cid) continue;
    if (!dueLotIdsByStaff.has(cid)) dueLotIdsByStaff.set(cid, []);
    dueLotIdsByStaff.get(cid)!.push(lot.id);
  }
  const allDueLotIds = dueMotherLots.map((l) => l.id);
  const handledItems = allDueLotIds.length === 0
    ? []
    : await prisma.plantingInstructionItem.findMany({
        where: { lotId: { in: allDueLotIds } }, distinct: ["lotId"], select: { lotId: true },
      });
  const handledLotIdSet = new Set(handledItems.map((i) => i.lotId));

  const backupCountByStaff = new Map<string, number>();
  for (const b of backupInstructions) backupCountByStaff.set(b.createdById, (backupCountByStaff.get(b.createdById) ?? 0) + 1);

  const motherPhotoTotal = activeMotherPlantTypes.length;
  const photoPlantTypesByStaff = new Map<string, Set<string>>();
  for (const p of motherPhotosThisWeek) {
    if (!photoPlantTypesByStaff.has(p.takenById)) photoPlantTypesByStaff.set(p.takenById, new Set());
    photoPlantTypesByStaff.get(p.takenById)!.add(p.plantTypeId);
  }

  const myInstructionIdsByStaff = new Map<string, string[]>();
  for (const i of myInstructionsAll) {
    if (!myInstructionIdsByStaff.has(i.createdById)) myInstructionIdsByStaff.set(i.createdById, []);
    myInstructionIdsByStaff.get(i.createdById)!.push(i.id);
  }
  const deviationAlertsByStaff = new Map<string, { cause: string | null }[]>();
  await Promise.all(
    staffIds.map(async (sid) => {
      const ids = myInstructionIdsByStaff.get(sid) ?? [];
      if (ids.length === 0) { deviationAlertsByStaff.set(sid, []); return; }
      const alerts = await prisma.alert.findMany({
        where: { type: "OUTPUT_DEVIATION", relatedType: "PlantingInstruction", relatedId: { in: ids }, createdAt: { gte: weekStart, lte: weekEnd } },
        select: { cause: true },
      });
      deviationAlertsByStaff.set(sid, alerts);
    })
  );

  return staffList
    .filter((staff) => !isBefore(evalEnd, startOfDay(staff.createdAt))) // tài khoản tạo sau cả tuần đang xem
    .map((staff) => {
      const days: TaskCompletionDay[] = [];

      if (!isAfter(thursdayDeadline, evalEnd) && !isBefore(thursdayDeadline, startOfDay(staff.createdAt))) {
        const dueLotIds = dueLotIdsByStaff.get(staff.id) ?? [];
        const instructionOk = dueLotIds.every((id) => handledLotIdSet.has(id));
        const backupOk = (backupCountByStaff.get(staff.id) ?? 0) >= MIN_BACKUP_INSTRUCTION_COUNT;
        days.push(buildDay(thursdayDeadline, [
          { title: "Tạo chỉ định cấy", done: instructionOk },
          { title: "Tạo chỉ định cấy dự phòng", done: backupOk },
        ], exemptions, staff.id));
      }

      if (!isAfter(tuesdayDeadline, evalEnd) && !isBefore(tuesdayDeadline, startOfDay(staff.createdAt))) {
        const photoSet = photoPlantTypesByStaff.get(staff.id) ?? new Set<string>();
        const motherPhotoOk = motherPhotoTotal === 0 || photoSet.size >= motherPhotoTotal;
        days.push(buildDay(tuesdayDeadline, [{ title: "Cập nhật hình ảnh định kì", done: motherPhotoOk }], exemptions, staff.id));
      }

      if (!isAfter(sundayDeadline, evalEnd) && !isBefore(sundayDeadline, startOfDay(staff.createdAt))) {
        const alerts = deviationAlertsByStaff.get(staff.id) ?? [];
        const checkOk = alerts.length === 0 || alerts.every((a) => a.cause !== null);
        days.push(buildDay(sundayDeadline, [{ title: "Kiểm tra tình trạng cấy", done: checkOk }], exemptions, staff.id));
      }

      return {
        staffId: staff.id, staffCode: staff.code, staffName: staff.name, role: "KY_THUAT" as const,
        notCompletedCount: countNotCompleted(days), days,
      };
    });
}

// ============================================================
// KHO_MO — 1 việc cá nhân hoá được (Kiểm tra kho tối), còn lại là việc CHUNG của cả kho sản xuất (không
// ghi nhận ai xử lý từng phiếu) — theo lựa chọn của người dùng, phần việc chung tính 1 lần/kho rồi áp
// dụng GIỐNG NHAU cho mọi NV kho mô cùng kho, cộng thêm phần cá nhân của riêng từng người.
// ============================================================
async function buildKhoMoSharedEvaluatedByDay(
  warehouseId: string, weekStart: Date, weekEnd: Date, evalEnd: Date, isCurrentWeek: boolean,
): Promise<Map<string, EvaluatedTask[]>> {
  const result = new Map<string, EvaluatedTask[]>();
  const addEvaluated = (date: Date, task: string, done: boolean) => {
    const key = format(date, "yyyy-MM-dd");
    if (!result.has(key)) result.set(key, []);
    result.get(key)!.push({ title: task, done });
  };

  const [
    receiveTransfers, mondayHandoverInstructions, finishedTransfers, mediumDays, contaminationLots,
    contaminationSubmission, confirmedReplantHandover, pendingReplantHandover, unbundledReplantCount,
  ] = await Promise.all([
    prisma.transfer.findMany({
      where: { toUserId: null, fromRoom: { type: "PHONG_TOI", warehouseId }, createdAt: { gte: weekStart, lte: evalEnd } },
      select: { createdAt: true, confirmedAt: true },
    }),
    prisma.plantingInstruction.findMany({
      where: {
        status: { not: "CANCELLED" },
        // Chỉ định DỰ PHÒNG (isBackup) không có hạn bàn giao cố định vào Thứ 2 như chỉ định thường — Kho
        // mô có thể bàn giao bất kỳ lúc nào trong tuần dự phòng đó (xem ensureBackupInstructionsCleaned),
        // nên loại khỏi đánh giá "Giao mẫu mẹ theo chỉ định cấy" thay vì tính thiếu khi chưa bàn giao.
        isBackup: false,
        // Chỉ tính chỉ định THỰC SỰ dành cho ĐÚNG tuần đang đánh giá (weekStart) — thiếu điều kiện này thì
        // 1 chỉ định KY_THUAT tạo sớm cho 1 tuần xa hơn (VD tạo hôm nay cho tuần sau nữa, không phải tuần
        // kế tiếp) sẽ bị tính "đến hạn giao" ở MỌI tuần đứng giữa (chỉ cần qua đủ mốc Thứ 5 tuần trước),
        // dù chưa thực sự tới tuần thực hiện của nó.
        weekStart: toStoredWeekStart(weekStart),
        createdAt: { lte: addDays(weekStart, -4) }, // trước Thứ 5 tuần trước (weekStart-4 = Thứ 5 tuần trước)
        items: { some: { shelf: { warehouseId } } },
      },
      select: { handedOverAt: true },
    }),
    prisma.transfer.findMany({
      where: { fromRoom: { type: "PHONG_RA_RE", warehouseId }, createdAt: { gte: weekStart, lte: weekEnd } },
      select: { confirmedAt: true },
    }),
    prisma.mediumOrderDay.findMany({
      where: {
        date: { gte: weekStart, lte: weekEnd }, handedOverAt: { not: null },
        order: { instructions: { some: { items: { some: { shelf: { warehouseId } } } } } },
      },
      select: { confirmedAt: true },
    }),
    // "Đề xuất Trồng/Hủy" và "Bàn giao cây trồng" đều dựa 1 phần vào trạng thái tức thời (tồn Phòng
    // nhiễm/đề xuất Trồng lại chưa gộp phiếu hiện tại) — không tái tạo được cho tuần đã qua, chỉ đánh
    // giá cho tuần hiện tại (xem khối if (isCurrentWeek) bên dưới).
    isCurrentWeek
      ? prisma.lot.findMany({ where: { status: "ACTIVE", room: { type: "PHONG_NHIEM", warehouseId } }, select: { quantity: true } })
      : Promise.resolve([]),
    isCurrentWeek
      ? prisma.contaminationProposal.findFirst({ where: { warehouseId, status: { not: "DRAFT" }, createdAt: { gte: weekStart, lte: evalEnd } }, select: { id: true } })
      : Promise.resolve(null),
    isCurrentWeek
      ? prisma.replantHandover.findFirst({ where: { warehouseId, status: "CONFIRMED", createdAt: { gte: weekStart, lte: evalEnd } }, select: { id: true } })
      : Promise.resolve(null),
    isCurrentWeek
      ? prisma.replantHandover.findFirst({ where: { warehouseId, status: "PENDING" }, select: { id: true } })
      : Promise.resolve(null),
    isCurrentWeek
      ? prisma.contaminationProposal.count({ where: { warehouseId, type: "TRONG", status: "APPROVED", replantHandoverId: null } })
      : Promise.resolve(0),
  ]);

  // Việc hàng ngày: "Nhận bàn giao từ kho tối" — hạn trong đúng ngày phiếu được tạo.
  for (let d = weekStart; !isAfter(d, evalEnd); d = addDays(d, 1)) {
    const dayEnd = endOfDay(d);
    const dayTransfers = receiveTransfers.filter((t) => isSameDay(t.createdAt, d));
    const allConfirmedInTime = dayTransfers.every((t) => t.confirmedAt !== null && !isAfter(t.confirmedAt, dayEnd));
    if (dayTransfers.length > 0) addEvaluated(d, "Nhận bàn giao từ kho tối", allConfirmedInTime);
  }

  // Việc tuần: "Giao mẫu mẹ theo chỉ định cấy" — hạn Thứ 2 đầu tuần đang xem (cho các chỉ định tạo trước
  // Thứ 5 tuần trước).
  if (!isAfter(weekStart, evalEnd)) {
    const mondayEnd = endOfDay(weekStart);
    const allHandedOverInTime = mondayHandoverInstructions.every((i) => i.handedOverAt !== null && !isAfter(i.handedOverAt, mondayEnd));
    if (mondayHandoverInstructions.length > 0) addEvaluated(weekStart, "Giao mẫu mẹ theo chỉ định cấy", allHandedOverInTime);
  }

  // 2 việc còn lại (hạn cố định trong tuần): hạn Chủ nhật cuối tuần đang xem.
  if (!isAfter(weekEnd, evalEnd)) {
    const sundayEnd = endOfDay(weekEnd);
    if (finishedTransfers.length > 0) {
      addEvaluated(weekEnd, "Bàn giao thành phẩm", finishedTransfers.every((t) => t.confirmedAt !== null && !isAfter(t.confirmedAt, sundayEnd)));
    }
    if (mediumDays.length > 0) {
      addEvaluated(weekEnd, "Nhận môi trường", mediumDays.every((d) => d.confirmedAt !== null && !isAfter(d.confirmedAt, sundayEnd)));
    }
  }

  // "Gửi đề xuất Trồng/Hủy" — hạn Thứ 5 (chỉ bắt buộc khi thực sự còn tồn Phòng nhiễm); "Bàn giao cây
  // trồng" — hạn Thứ 6 (chỉ bắt buộc khi còn đề xuất Trồng lại chưa gộp phiếu, hoặc đã gộp nhưng Nhân
  // viên sản xuất chưa xác nhận). Làm trễ (qua hạn mới xong) vẫn tính "tuần không hoàn thành" vì missed
  // được gắn cố định vào đúng ngày hạn chót, không xoá khi xong muộn — cùng quy ước với "Giao mẫu mẹ
  // theo chỉ định cấy" ở trên.
  if (isCurrentWeek) {
    const thursdayDeadline = addDays(weekStart, 3);
    if (!isAfter(thursdayDeadline, evalEnd)) {
      const outstanding = contaminationLots.reduce((s, l) => s + l.quantity, 0);
      if (outstanding > 0) addEvaluated(thursdayDeadline, "Gửi đề xuất Trồng/Hủy", contaminationSubmission !== null);
    }

    const fridayDeadline = addDays(weekStart, 4);
    if (!isAfter(fridayDeadline, evalEnd)) {
      const outstandingReplant = unbundledReplantCount > 0 || pendingReplantHandover !== null;
      if (outstandingReplant) addEvaluated(fridayDeadline, "Bàn giao cây trồng", confirmedReplantHandover !== null);
    }
  }

  return result;
}

async function buildKhoMoRows(
  weekStart: Date, weekEnd: Date, evalEnd: Date, isCurrentWeek: boolean, workplaceWarehouseId: string | null,
): Promise<TaskCompletionStaffRow[]> {
  const staffList = await prisma.user.findMany({
    where: { role: "KHO_MO", isActive: true, ...(workplaceWarehouseId ? { workplaceWarehouseId } : {}) },
    select: { id: true, code: true, name: true, createdAt: true, workplaceWarehouseId: true },
    orderBy: { name: "asc" },
  });
  if (staffList.length === 0) return [];
  const staffIds = staffList.map((s) => s.id);

  const warehouseIds = [...new Set(staffList.map((s) => s.workplaceWarehouseId).filter((id): id is string => !!id))];
  const [exemptions, checklistItems, sharedByWarehouseEntries] = await Promise.all([
    loadExemptions(staffIds, weekStart, evalEnd),
    prisma.checklistItem.findMany({
      where: { userId: { in: staffIds }, kind: "DARK_ROOM_CHECK", assignedDate: { gte: weekStart, lte: evalEnd } },
      select: { userId: true, assignedDate: true, completed: true },
    }),
    Promise.all(warehouseIds.map(async (wid) => [wid, await buildKhoMoSharedEvaluatedByDay(wid, weekStart, weekEnd, evalEnd, isCurrentWeek)] as const)),
  ]);
  const sharedByWarehouse = new Map(sharedByWarehouseEntries);

  return staffList.map((staff) => {
    const shared = staff.workplaceWarehouseId ? sharedByWarehouse.get(staff.workplaceWarehouseId) : undefined;
    const days: TaskCompletionDay[] = [];
    for (let d = weekStart; !isAfter(d, evalEnd); d = addDays(d, 1)) {
      if (isBefore(d, startOfDay(staff.createdAt))) continue;
      const evaluated: EvaluatedTask[] = [...(shared?.get(format(d, "yyyy-MM-dd")) ?? [])];
      const item = checklistItems.find((c) => c.userId === staff.id && isSameDay(c.assignedDate, d));
      if (item) evaluated.push({ title: "Kiểm tra kho tối", done: item.completed });
      days.push(buildDay(d, evaluated, exemptions, staff.id));
    }
    return {
      staffId: staff.id, staffCode: staff.code, staffName: staff.name, role: "KHO_MO" as const,
      notCompletedCount: countNotCompleted(days), days,
    };
  });
}

export async function getTaskCompletionReport(
  weekStartInput: Date, workplaceWarehouseId: string | null,
): Promise<TaskCompletionStaffRow[]> {
  const weekStart = startOfDay(weekStartInput);
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const today = startOfDay(new Date());
  const evalEnd = isAfter(weekEnd, today) ? today : weekEnd;
  const isCurrentWeek = !isAfter(weekStart, today) && !isAfter(today, weekEnd);
  if (isBefore(evalEnd, weekStart)) return []; // tuần hoàn toàn trong tương lai

  const [cayMo, kyThuat, khoMo] = await Promise.all([
    buildCayMoRows(weekStart, evalEnd, isCurrentWeek, workplaceWarehouseId),
    buildKyThuatRows(weekStart, weekEnd, evalEnd),
    buildKhoMoRows(weekStart, weekEnd, evalEnd, isCurrentWeek, workplaceWarehouseId),
  ]);

  return [...kyThuat, ...cayMo, ...khoMo];
}

export type DailyChecklistRow = {
  userId: string;
  userName: string;
  role: "KY_THUAT" | "CAY_MO" | "KHO_MO";
  items: { title: string; completed: boolean }[];
};

// Dùng lại getTaskCompletionReport (đã tái tạo đúng nhiệm vụ thật của KY_THUAT/CAY_MO/KHO_MO cho bất kỳ
// ngày nào) để phục vụ báo cáo "Hoàn thành checklist theo ngày" (/api/checklist-report) — khác
// getTaskCompletionReport ở chỗ trả về CẢ việc đã xong lẫn chưa xong trong ngày (không chỉ việc thiếu),
// và chỉ 1 ngày thay vì cả tuần. Bỏ qua NV không có nhiệm vụ nào đến hạn đúng ngày đó (VD KY_THUAT ngoài
// Thứ 3/5/CN, hoặc ngày trước khi NV vào làm).
export async function getDailyTaskChecklist(date: Date): Promise<DailyChecklistRow[]> {
  const weekStart = startOfWeek(startOfDay(date), { weekStartsOn: 1 });
  const rows = await getTaskCompletionReport(weekStart, null);
  const dateKey = format(startOfDay(date), "yyyy-MM-dd");

  return rows
    .map((r) => {
      const day = r.days.find((d) => d.date === dateKey);
      if (!day || (day.completedTasks.length === 0 && day.missedTasks.length === 0)) return null;
      const items = [
        ...day.completedTasks.map((title) => ({ title, completed: true })),
        ...day.missedTasks.map((title) => ({ title, completed: false })),
      ];
      return { userId: r.staffId, userName: r.staffName, role: r.role, items };
    })
    .filter((r): r is DailyChecklistRow => r !== null);
}
