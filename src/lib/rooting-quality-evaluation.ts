import { prisma } from "@/lib/prisma";
import { createAlert, createAlertForWarehouseStaff } from "@/lib/inventory";
import { generateRootingQualityEvaluationCode } from "@/lib/codes";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { summarizeRootingWeekGroups, getRootingRotationEpoch } from "@/lib/rooting-week-group";
import { startOfWeek, addDays, addWeeks, subWeeks, endOfDay, format } from "date-fns";

// Lịch của nhiệm vụ "Đánh giá chất lượng cây ra rễ" (tính theo TUẦN XUẤT của Nhóm — weekStart của đánh giá):
// mở việc + nhắc hằng ngày từ Thứ 5 của tuần TRƯỚC tuần xuất, hạn chót hết Thứ 3 của chính tuần xuất (để
// Kho mô còn cả nửa sau tuần bàn giao phần đã đạt).
export const ROOTING_EVAL_DEADLINE_LABEL = "Thứ 3";
export const rootingEvalDeadline = (exportWeekMonday: Date) => endOfDay(addDays(exportWeekMonday, 1));
const rootingEvalOpensAt = (exportWeekMonday: Date) => addDays(exportWeekMonday, -4);

// Các tuần xuất đang "mở" nhiệm vụ tại thời điểm now: luôn có tuần này; từ Thứ 5 trở đi có thêm tuần sau.
// Trả về Thứ 2 theo giờ local (server chạy Asia/Ho_Chi_Minh) — lưu DB thì qua toStoredWeekStart.
export function openRootingEvalWeeks(now: Date = new Date()): Date[] {
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 });
  const nextWeek = addWeeks(thisWeek, 1);
  return now >= rootingEvalOpensAt(nextWeek) ? [thisWeek, nextWeek] : [thisWeek];
}

// Nhãn hiển thị của 1 đánh giá: "Nhóm tuần ra rễ {tên}" + tuần cây VÀO Phòng ra rễ của đúng lứa đang được
// đánh giá. Lô được xếp vào Nhóm của tuần nó vào Phòng ra rễ (xem resolveRaReGroupAt ở shelf-assignment.ts)
// và Nhóm đó tới hạn lại sau đúng 1 vòng N tuần (N = tổng số Nhóm RA_RE, cùng N dùng ở
// ensureWeeklyRootingQualityEvaluation) — nên lứa được đánh giá ở tuần weekStart là lứa vào phòng tuần
// weekStart − N. Không phụ thuộc mốc "Tuần khởi đầu Nhóm 1" của từng kho (chỉ dùng độ dài chu kỳ).
export function describeRootingEvaluationGroup(groupName: string, weekStart: Date, totalSlots: number) {
  const name = groupName.trim();
  const label = /^nhóm/i.test(name) ? name : `Nhóm tuần ra rễ ${name}`;
  if (totalSlots <= 0) return { label, entryWeek: null };
  const entryMonday = subWeeks(weekStart, totalSlots);
  return { label, entryWeek: `${format(entryMonday, "dd/MM")} – ${format(addDays(entryMonday, 6), "dd/MM/yyyy")}` };
}

export function countRootingRotationSlots() {
  return prisma.shelfGroup.count({ where: { rotationKind: "RA_RE" } });
}

// Rút gọn danh sách mã kệ thành các dải liên tiếp để ghi cạnh tên Nhóm — bỏ tiền tố kho/phòng (lấy đoạn
// sau dấu "-" cuối, VD "SX-F-PRR-I01C01" → "I01C01"), gom theo phần đứng trước số cuối (VD "I01C") rồi nối
// các số liền nhau: ["I01C01".."I01C12", "I02C01".."I02C12"] → "I01C01 -> I01C12 và I02C01 -> I02C12".
export function compactShelfCodes(codes: string[]): string {
  const byPrefix = new Map<string, { num: number; width: number }[]>();
  const loose: string[] = [];
  for (const code of codes) {
    const short = code.slice(code.lastIndexOf("-") + 1);
    const m = short.match(/^(.*?)(\d+)$/);
    if (!m) { loose.push(short); continue; }
    byPrefix.set(m[1], [...(byPrefix.get(m[1]) ?? []), { num: Number(m[2]), width: m[2].length }]);
  }
  const parts: string[] = [];
  for (const [prefix, nums] of [...byPrefix].sort(([a], [b]) => a.localeCompare(b))) {
    nums.sort((a, b) => a.num - b.num);
    const label = (n: { num: number; width: number }) => `${prefix}${String(n.num).padStart(n.width, "0")}`;
    let start = nums[0];
    let prev = nums[0];
    for (const n of [...nums.slice(1), null]) {
      if (n && n.num === prev.num + 1) { prev = n; continue; }
      parts.push(start === prev ? label(start) : `${label(start)} -> ${label(prev)}`);
      if (n) { start = n; prev = n; }
    }
  }
  parts.push(...loose.sort());
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} và ${parts[parts.length - 1]}`;
}

// Dải kệ (đang hoạt động) của từng cặp (phòng, Nhóm tuần ra rễ) — key `${roomId}|${rotationGroupId}`.
export async function loadRootingGroupShelfRanges(pairs: { roomId: string; rotationGroupId: string }[]): Promise<Map<string, string>> {
  if (pairs.length === 0) return new Map();
  const shelves = await prisma.shelf.findMany({
    where: {
      isActive: true,
      roomId: { in: [...new Set(pairs.map((p) => p.roomId))] },
      rotationGroupId: { in: [...new Set(pairs.map((p) => p.rotationGroupId))] },
    },
    select: { code: true, roomId: true, rotationGroupId: true },
  });
  const codesByKey = new Map<string, string[]>();
  for (const s of shelves) {
    const key = `${s.roomId}|${s.rotationGroupId}`;
    codesByKey.set(key, [...(codesByKey.get(key) ?? []), s.code]);
  }
  return new Map([...codesByKey].map(([key, codes]) => [key, compactShelfCodes(codes)]));
}

// "Đánh giá chất lượng cây ra rễ" — NV Kỹ thuật đánh giá đạt/không đạt cho MỖI Nhóm tuần ra rễ đến tuần
// xuất của 1 kho sản xuất, trước khi Kho mô được bàn giao sang Kho thành phẩm (xem
// PATCH /api/rooting-quality-evaluations/[id]). Tự sinh lazy mỗi lần tải trang giống mọi hàm ensureXxx
// khác (xem src/app/(dashboard)/layout.tsx), tự động giao thẳng cho đúng NV Kỹ thuật DUY NHẤT của kho đó
// (không qua bước phân công thủ công — mỗi kho chỉ có 1 người, khác hẳn Kho thành phẩm nhiều NV).
// Từ Thứ 5 sinh luôn đánh giá cho Nhóm sẽ xuất TUẦN SAU (weekStart = tuần sau) để NV Kỹ thuật làm trước,
// hạn Thứ 3 tuần xuất — xem openRootingEvalWeeks. Số lượng chốt lúc bấm hoàn thành (PATCH đọc lô ACTIVE
// lúc đó), không phải lúc sinh đánh giá.
export async function ensureWeeklyRootingQualityEvaluation(warehouseId: string | null) {
  if (!warehouseId) return;

  const kyThuat = await prisma.user.findFirst({
    where: { workplaceWarehouseId: warehouseId, role: "KY_THUAT", isActive: true },
    select: { id: true },
  });
  if (!kyThuat) return;

  const [rooms, raReGroups, epochMonday] = await Promise.all([
    prisma.room.findMany({
      where: { warehouseId, type: "PHONG_RA_RE", isActive: true },
      select: {
        id: true,
        shelves: {
          where: { isActive: true },
          select: {
            id: true, code: true, name: true,
            rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
            lots: { where: { status: "ACTIVE", quantity: { gt: 0 } }, select: { quantity: true, enteredAt: true } },
          },
        },
      },
    }),
    prisma.shelfGroup.findMany({ where: { rotationKind: "RA_RE" }, select: { id: true, rotationOrder: true } }),
    getRootingRotationEpoch(warehouseId),
  ]);
  if (raReGroups.length === 0) return;

  const now = new Date();
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 });

  for (const exportWeek of openRootingEvalWeeks(now)) {
    const weekStart = toStoredWeekStart(exportWeek);
    // Tuần này: xét Nhóm đang đến hạn tại now; tuần sau: xét Nhóm sẽ đến hạn vào Thứ 2 tuần sau.
    const refDate = exportWeek.getTime() === thisWeek.getTime() ? now : exportWeek;
    for (const room of rooms) {
      const statuses = summarizeRootingWeekGroups(room.shelves, refDate, raReGroups.length, epochMonday);
      for (const s of statuses.filter((g) => g.isDue)) {
        const existing = await prisma.rootingQualityEvaluation.findUnique({
          where: { roomId_rotationGroupId_weekStart: { roomId: room.id, rotationGroupId: s.groupId, weekStart } },
          select: { id: true },
        });
        if (existing) continue;
        await prisma.rootingQualityEvaluation.upsert({
          where: { roomId_rotationGroupId_weekStart: { roomId: room.id, rotationGroupId: s.groupId, weekStart } },
          update: {},
          create: {
            code: await generateRootingQualityEvaluationCode(),
            warehouseId,
            roomId: room.id,
            rotationGroupId: s.groupId,
            weekStart,
            assignedToId: kyThuat.id,
          },
        });
      }
    }
  }
}

// Nhắc MỖI NGÀY (1 thông báo/ngày/đánh giá, dedup qua relatedId có kèm ngày) từ Thứ 5 tuần trước tuần xuất
// cho tới khi hoàn thành — quá hạn Thứ 3 tuần xuất vẫn nhắc tiếp (ghi rõ đã quá hạn) tới hết tuần xuất. Đánh
// dấu đã đọc các nhắc của những ngày trước cho cùng đánh giá để không dồn đống thông báo cũ.
export async function ensureRootingQualityEvaluationReminder(warehouseId: string | null) {
  if (!warehouseId) return;
  const now = new Date();
  const weeks = openRootingEvalWeeks(now);

  const pending = await prisma.rootingQualityEvaluation.findMany({
    where: { warehouseId, status: "PENDING", weekStart: { in: weeks.map(toStoredWeekStart) } },
    select: { id: true, code: true, assignedToId: true, weekStart: true, rotationGroup: { select: { name: true } } },
  });
  const today = format(now, "yyyy-MM-dd");
  for (const evaluation of pending) {
    const prefix = `rooting-quality-eval:${evaluation.id}:`;
    const relatedId = `${prefix}${today}`;
    const sent = await prisma.alert.findFirst({ where: { type: "ROOTING_QUALITY_EVALUATION_DUE", relatedId } });
    if (sent) continue;

    const exportWeek = weeks.find((w) => toStoredWeekStart(w).getTime() === evaluation.weekStart.getTime()) ?? weeks[0];
    const deadline = rootingEvalDeadline(exportWeek);
    const { label } = describeRootingEvaluationGroup(evaluation.rotationGroup.name, evaluation.weekStart, 0);
    const deadlineText = `${ROOTING_EVAL_DEADLINE_LABEL} ${format(deadline, "dd/MM")}`;
    const overdue = now > deadline;

    await prisma.alert.updateMany({
      where: { type: "ROOTING_QUALITY_EVALUATION_DUE", relatedId: { startsWith: prefix }, readAt: null },
      data: { readAt: now },
    });
    await createAlert({
      type: "ROOTING_QUALITY_EVALUATION_DUE",
      title: overdue ? "Quá hạn đánh giá chất lượng cây ra rễ" : "Nhiệm vụ đánh giá chất lượng cây ra rễ",
      message: overdue
        ? `Đánh giá "${evaluation.code}" (${label}) đã quá hạn ${deadlineText} — cần hoàn thành ngay, Kho mô chưa thể bàn giao Nhóm này.`
        : `Cần hoàn thành đánh giá "${evaluation.code}" (${label}) trong ngày ${deadlineText} — tuần xuất của Nhóm này.`,
      userId: evaluation.assignedToId,
      relatedId,
      relatedType: "RootingQualityEvaluation",
    });
  }
}

// Số liệu cho dòng "Đánh giá chất lượng cây ra rễ" ở Công việc trong tuần (dashboard NV Kỹ thuật): đánh giá
// của tuần xuất đang mở gần nhất (từ Thứ 5 là tuần sau) + đánh giá còn treo của tuần này (quá hạn).
export async function getRootingEvalWeeklyTask(userId: string, now: Date = new Date()) {
  const weeks = openRootingEvalWeeks(now);
  const targetWeek = weeks[weeks.length - 1];
  const evaluations = await prisma.rootingQualityEvaluation.findMany({
    where: {
      assignedToId: userId,
      OR: [
        { weekStart: toStoredWeekStart(targetWeek) },
        ...(weeks.length > 1 ? [{ weekStart: toStoredWeekStart(weeks[0]), status: "PENDING" as const }] : []),
      ],
    },
    select: { status: true, weekStart: true },
  });
  const done = evaluations.filter((e) => e.status !== "PENDING").length;
  const overdue = evaluations.some((e) => {
    if (e.status !== "PENDING") return false;
    const week = weeks.find((w) => toStoredWeekStart(w).getTime() === e.weekStart.getTime()) ?? targetWeek;
    return now > rootingEvalDeadline(week);
  });
  return { total: evaluations.length, done, overdue, deadline: rootingEvalDeadline(targetWeek) };
}

// Sau khi NV Kỹ thuật hoàn thành 1 đánh giá — báo Kho mô cùng kho biết tỉ lệ đạt/không đạt + lý do (Admin
// cấp cao/Admin kỹ thuật xem qua widget Dashboard, xem ADMIN_DASHBOARD_ALERT_TYPES, không cần alert riêng).
export async function notifyRootingQualityEvaluationReady(params: {
  warehouseId: string;
  code: string;
  totalQuantity: number;
  passedQuantity: number;
  reason: string;
}) {
  const { warehouseId, code, totalQuantity, passedQuantity, reason } = params;
  const failedQuantity = totalQuantity - passedQuantity;
  const pct = totalQuantity > 0 ? Math.round((passedQuantity / totalQuantity) * 1000) / 10 : 0;
  await createAlertForWarehouseStaff({
    role: "KHO_MO",
    warehouseId,
    type: "ROOTING_QUALITY_EVALUATION_READY",
    title: "Đã có kết quả đánh giá chất lượng cây ra rễ",
    message: `Đánh giá ${code}: đạt ${passedQuantity.toLocaleString("vi-VN")}/${totalQuantity.toLocaleString("vi-VN")} (${pct}%), không đạt ${failedQuantity.toLocaleString("vi-VN")} đã lùi sang tuần sau. Lý do: ${reason}`,
    relatedId: code,
    relatedType: "RootingQualityEvaluation",
  });
}

export type PendingRootingEvaluation = { code: string; roomId: string; rotationGroupId: string; groupName: string; assignedToName: string };

// Đánh giá chất lượng TUẦN NÀY còn PENDING của các Nhóm tuần ra rễ chứa những kệ đã cho — Kho mô CHƯA được
// bàn giao Nhóm đó cho tới khi NV Kỹ thuật hoàn thành (lúc hoàn thành mới tách phần không đạt sang Nhóm kế
// tiếp, xem PATCH /api/rooting-quality-evaluations/[id]) — trước đây không chặn gì, Kho mô bàn giao cả Nhóm
// kể cả cây chưa đạt (Bát Tràng 28/09/2026 Nhóm 4). Chỉ xét đánh giá của tuần hiện tại: đánh giá tuần cũ
// bỏ dở không chặn mãi Nhóm đó ở các vòng sau; kho không có NV Kỹ thuật thì không sinh đánh giá nên không chặn.
export async function findPendingRootingEvaluationsForShelves(shelfIds: string[]): Promise<PendingRootingEvaluation[]> {
  if (shelfIds.length === 0) return [];
  const shelves = await prisma.shelf.findMany({
    where: { id: { in: shelfIds }, rotationGroupId: { not: null }, roomId: { not: null } },
    select: { roomId: true, rotationGroupId: true },
  });
  const pairs = [...new Map(shelves.map((s) => [`${s.roomId}:${s.rotationGroupId}`, { roomId: s.roomId!, rotationGroupId: s.rotationGroupId! }])).values()];
  if (pairs.length === 0) return [];
  const evaluations = await prisma.rootingQualityEvaluation.findMany({
    where: {
      status: "PENDING",
      weekStart: toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })),
      OR: pairs,
    },
    select: { code: true, roomId: true, rotationGroupId: true, rotationGroup: { select: { name: true } }, assignedTo: { select: { name: true } } },
  });
  return evaluations.map((e) => ({
    code: e.code, roomId: e.roomId, rotationGroupId: e.rotationGroupId,
    groupName: e.rotationGroup.name, assignedToName: e.assignedTo.name,
  }));
}

export function pendingRootingEvaluationMessage(pending: PendingRootingEvaluation[]): string {
  const groups = [...new Set(pending.map((p) => p.groupName))].join(", ");
  const assignees = [...new Set(pending.map((p) => p.assignedToName))].join(", ");
  return `Nhóm tuần ra rễ ${groups} chưa được NV Kỹ thuật (${assignees}) đánh giá chất lượng — chưa thể bàn giao cho tới khi đánh giá xong`;
}
