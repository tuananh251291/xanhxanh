import { prisma } from "@/lib/prisma";
import { createAlert, createAlertForWarehouseStaff } from "@/lib/inventory";
import { generateRootingQualityEvaluationCode } from "@/lib/codes";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { summarizeRootingWeekGroups, getRootingRotationEpoch } from "@/lib/rooting-week-group";
import { startOfWeek, addDays, subWeeks, format } from "date-fns";

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

// "Đánh giá chất lượng cây ra rễ" — NV Kỹ thuật đánh giá đạt/không đạt cho MỖI Nhóm tuần ra rễ ĐANG ĐẾN
// HẠN của 1 kho sản xuất, trước khi Kho mô được bàn giao sang Kho thành phẩm (hạn Thứ 7 — xem
// PATCH /api/rooting-quality-evaluations/[id]). Tự sinh lazy mỗi lần tải trang giống mọi hàm ensureXxx
// khác (xem src/app/(dashboard)/layout.tsx), tự động giao thẳng cho đúng NV Kỹ thuật DUY NHẤT của kho đó
// (không qua bước phân công thủ công — mỗi kho chỉ có 1 người, khác hẳn Kho thành phẩm nhiều NV).
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
            lots: { where: { status: "ACTIVE" }, select: { quantity: true, enteredAt: true } },
          },
        },
      },
    }),
    prisma.shelfGroup.findMany({ where: { rotationKind: "RA_RE" }, select: { id: true, rotationOrder: true } }),
    getRootingRotationEpoch(warehouseId),
  ]);
  if (raReGroups.length === 0) return;

  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  for (const room of rooms) {
    const statuses = summarizeRootingWeekGroups(room.shelves, new Date(), raReGroups.length, epochMonday);
    for (const s of statuses.filter((g) => g.isDue)) {
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

// Nhắc hạn từ Thứ 4 — hạn hoàn thành trước Thứ 6 (để Kho mô còn kịp bàn giao Thứ 7), 1 lần/tuần/Nhóm
// (dedup qua relatedId), cùng quy ước ensureWeeklyDeXuatTask/ensureWeeklyMarketInspectionTask.
export async function ensureRootingQualityEvaluationReminder(warehouseId: string | null) {
  if (!warehouseId) return;
  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const wednesday = addDays(weekStart, 2);
  if (new Date() < wednesday) return;

  const pending = await prisma.rootingQualityEvaluation.findMany({
    where: { warehouseId, weekStart, status: "PENDING" },
    select: { id: true, code: true, assignedToId: true },
  });
  for (const evaluation of pending) {
    const relatedId = `rooting-quality-eval:${evaluation.id}`;
    const sent = await prisma.alert.findFirst({ where: { type: "ROOTING_QUALITY_EVALUATION_DUE", relatedId } });
    if (sent) continue;
    await createAlert({
      type: "ROOTING_QUALITY_EVALUATION_DUE",
      title: "Đến hạn đánh giá chất lượng cây ra rễ",
      message: `Cần hoàn thành đánh giá "${evaluation.code}" trước Thứ Sáu tuần này để Kho mô kịp bàn giao Thứ Bảy.`,
      userId: evaluation.assignedToId,
      relatedId,
      relatedType: "RootingQualityEvaluation",
    });
  }
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
