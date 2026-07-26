// Key lưu trong SystemConfig (xem src/lib/inventory.ts getSystemConfig) — giá trị là chuỗi tuần ISO 8601
// dạng "YYYY-Www" (VD "2026-W27") do input type="week" sinh ra, đánh dấu tuần thực tế đầu tiên được coi
// là Nhóm tuần ra rễ 1. Xem src/app/api/settings/rotation-start-week/route.ts. Toán học xoay vòng
// (isoWeekStringToMonday, getCurrentWeekSlot) dùng chung với Nhóm tuần mẫu mẹ — xem src/lib/week-rotation.ts.
import { getCurrentWeekSlot, isoWeekStringToMonday } from "@/lib/week-rotation";
import { getSystemConfig } from "@/lib/inventory";

export { isoWeekStringToMonday, getCurrentWeekSlot } from "@/lib/week-rotation";

export const ROOTING_ROTATION_START_WEEK_KEY = "rooting_rotation_start_week";

// Đọc mốc "Tuần khởi đầu của Nhóm tuần ra rễ 1" đã cấu hình (nếu có) — dùng làm epochMonday truyền vào
// summarizeRootingWeekGroups để tính isDue theo lịch. undefined nếu SUPER_ADMIN chưa cấu hình gì.
export async function getRootingRotationEpoch(): Promise<Date | undefined> {
  const value = await getSystemConfig(ROOTING_ROTATION_START_WEEK_KEY, "");
  return value ? (isoWeekStringToMonday(value) ?? undefined) : undefined;
}

export type RootingWeekGroupStatus = {
  groupId: string;
  groupName: string;
  rotationOrder: number | null;
  shelves: { id: string; code: string; name: string }[];
  lotCount: number;
  totalQuantity: number;
  oldestEnteredAt: Date | null;
  isDue: boolean;
};

// Tổng hợp theo Nhóm xoay vòng (rotationGroup) cho các kệ Phòng ra rễ của 1 kho — kệ chưa gán Nhóm nào bị
// bỏ qua hoàn toàn, không tính vào bất kỳ nhóm nào.
//
// "Đạt xuất" (isDue) tính THUẦN theo lịch xoay vòng — KHÔNG còn dựa vào Lot.expectedMoveAt/ngày nhập lô
// của từng lô nữa (đổi theo yêu cầu: đã có Nhóm tuần ra rễ gắn với tuần thật cụ thể qua "Tuần khởi đầu
// của Nhóm tuần ra rễ 1", không cần theo dõi ngày lô riêng lẻ). Một Nhóm được coi là "đạt xuất" khi
// rotationOrder của Nhóm khớp với getCurrentWeekSlot(totalSlots, ..., epochMonday) — totalSlots = tổng số
// Nhóm xoay vòng RA_RE đang cấu hình (giống hệt N dùng để chọn "khe tuần hiện tại" lúc xếp kệ lô mới, xem
// src/lib/shelf-assignment.ts, để 2 nơi luôn đồng bộ cùng 1 lịch). Nhóm chưa có lô nào (rỗng) vẫn không
// được coi là "đạt xuất" dù đúng lịch — tránh hiện thẻ cảnh báo trống không có gì để bàn giao.
export function summarizeRootingWeekGroups(
  shelves: {
    id: string;
    code: string;
    name: string;
    rotationGroup: { id: string; name: string; rotationOrder: number | null } | null;
    lots: { quantity: number; enteredAt: Date }[];
  }[],
  now: Date = new Date(),
  totalSlots = 0,
  epochMonday?: Date
): RootingWeekGroupStatus[] {
  // Chỉ tính "khe hiện tại" khi ĐÃ cấu hình epochMonday — getCurrentWeekSlot tự có epoch mặc định (không
  // mang ý nghĩa nghiệp vụ) nếu không truyền, nên phải chặn tường minh ở đây thay vì để lọt qua, tránh báo
  // "đạt xuất" dựa trên 1 mốc vô nghĩa khi SUPER_ADMIN chưa cấu hình "Tuần khởi đầu của Nhóm tuần ra rễ 1".
  const currentSlot = totalSlots > 0 && epochMonday ? getCurrentWeekSlot(totalSlots, now, epochMonday) : null;

  const byGroup = new Map<string, RootingWeekGroupStatus>();
  for (const shelf of shelves) {
    if (!shelf.rotationGroup) continue;
    const key = shelf.rotationGroup.id;
    const entry = byGroup.get(key) ?? {
      groupId: key,
      groupName: shelf.rotationGroup.name,
      rotationOrder: shelf.rotationGroup.rotationOrder,
      shelves: [],
      lotCount: 0,
      totalQuantity: 0,
      oldestEnteredAt: null,
      isDue: false,
    };
    entry.shelves.push({ id: shelf.id, code: shelf.code, name: shelf.name });
    for (const lot of shelf.lots) {
      entry.lotCount += 1;
      entry.totalQuantity += lot.quantity;
      if (!entry.oldestEnteredAt || lot.enteredAt < entry.oldestEnteredAt) entry.oldestEnteredAt = lot.enteredAt;
    }
    byGroup.set(key, entry);
  }

  if (currentSlot !== null) {
    for (const entry of byGroup.values()) {
      entry.isDue = entry.rotationOrder === currentSlot && entry.lotCount > 0;
    }
  }

  return Array.from(byGroup.values()).sort((a, b) => (a.rotationOrder ?? 0) - (b.rotationOrder ?? 0));
}
