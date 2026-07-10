import { differenceInCalendarWeeks } from "date-fns";

// Thứ 2 cố định làm mốc — chỉ dùng để tính số tuần liên tục trôi qua, không mang ý nghĩa nghiệp vụ gì.
const EPOCH_MONDAY = new Date(2024, 0, 1);

// Cố định 3 tuần cho MỌI loại cây (khác rootingWeeks — field đó chỉ dùng tính Lot.expectedMoveAt cho
// luồng riêng, không liên quan cơ chế Nhóm tuần ra rễ này).
export const ROOTING_WEEK_HOLD_DAYS = 21;

// Tuần nào (Thứ 2 - Chủ nhật) thì cây ra rễ tuần đó được xếp vào đúng weekSlot này — xoay vòng 4 tuần
// 1 chu kỳ, không cần lưu trạng thái "đang là nhóm mấy" (tính lại y hệt mỗi lần gọi, ổn định qua các
// lần restart server, không lệch khi qua năm mới vì đếm số tuần liên tục từ 1 mốc cố định).
export function getCurrentWeekSlot(date: Date = new Date()): 1 | 2 | 3 | 4 {
  const weekIndex = differenceInCalendarWeeks(date, EPOCH_MONDAY, { weekStartsOn: 1 });
  const slot = (((weekIndex % 4) + 4) % 4) + 1;
  return slot as 1 | 2 | 3 | 4;
}

export type RootingWeekGroupStatus = {
  weekSlot: number;
  shelves: { id: string; code: string; name: string }[];
  lotCount: number;
  totalQuantity: number;
  oldestEnteredAt: Date | null;
  isDue: boolean;
};

// Tổng hợp theo weekSlot cho các kệ Phòng ra rễ của 1 kho — kệ chưa gán weekSlot (chưa tham gia cơ chế
// Nhóm tuần ra rễ) bị bỏ qua hoàn toàn, không tính vào bất kỳ nhóm nào. "Đạt xuất" = lô cũ nhất trong nhóm đã
// nằm ở kệ (enteredAt) đủ ROOTING_WEEK_HOLD_DAYS ngày trở lên.
export function summarizeRootingWeekGroups(
  shelves: { id: string; code: string; name: string; weekSlot: number | null; lots: { quantity: number; enteredAt: Date }[] }[],
  now: Date = new Date()
): RootingWeekGroupStatus[] {
  const bySlot = new Map<number, RootingWeekGroupStatus>();
  for (const shelf of shelves) {
    if (shelf.weekSlot == null) continue;
    const entry = bySlot.get(shelf.weekSlot) ?? {
      weekSlot: shelf.weekSlot,
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
    bySlot.set(shelf.weekSlot, entry);
  }

  const holdMs = ROOTING_WEEK_HOLD_DAYS * 24 * 60 * 60 * 1000;
  return Array.from(bySlot.values())
    .map((g) => ({
      ...g,
      isDue: g.lotCount > 0 && g.oldestEnteredAt !== null && now.getTime() - g.oldestEnteredAt.getTime() >= holdMs,
    }))
    .sort((a, b) => a.weekSlot - b.weekSlot);
}
