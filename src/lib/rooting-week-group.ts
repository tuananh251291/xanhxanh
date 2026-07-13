import { differenceInCalendarWeeks } from "date-fns";

// Thứ 2 cố định làm mốc — chỉ dùng để tính số tuần liên tục trôi qua, không mang ý nghĩa nghiệp vụ gì.
const EPOCH_MONDAY = new Date(2024, 0, 1);

// Khe nào (Thứ 2 - Chủ nhật) trong chu kỳ N tuần liên tục thì được coi là "hiện tại" — N = tổng số Nhóm
// xoay vòng cùng loại (rotationKind) đang được SUPER_ADMIN cấu hình tại /settings/shelf-groups (xem
// ShelfGroup.rotationOrder), KHÔNG còn hard-code 4 như trước (Nhóm tuần ra rễ và Nhóm tuần mẫu mẹ có thể
// có số khe khác nhau, VD 4 và 6). Xoay vòng đều đặn theo tuần liên tục mod N, không cần lưu "nhóm đang
// active" — tính lại y hệt mỗi lần gọi, ổn định qua các lần restart server, không lệch khi qua năm mới.
// Đây CHỈ quyết định xếp kệ nào (planShelfAssignments) — KHÔNG liên quan tới việc tính "đến hạn chuyển
// kho thành phẩm" (xem summarizeRootingWeekGroups bên dưới, dựa trên Lot.expectedMoveAt riêng từng lô).
export function getCurrentWeekSlot(totalSlots: number, date: Date = new Date()): number {
  if (totalSlots <= 0) return 1;
  const weekIndex = differenceInCalendarWeeks(date, EPOCH_MONDAY, { weekStartsOn: 1 });
  return (((weekIndex % totalSlots) + totalSlots) % totalSlots) + 1;
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
// bỏ qua hoàn toàn, không tính vào bất kỳ nhóm nào. "Đạt xuất" = nhóm có ít nhất 1 lô đã đến hạn chuyển kho
// thành phẩm theo ĐÚNG thời gian ra rễ của mã cây lô đó (Lot.expectedMoveAt, cộng PlantType.rootingWeeks
// riêng từng mã cây lúc tạo lô — xem src/app/api/daily-records/route.ts) — KHÔNG dùng 1 hằng số tuần chung
// cho mọi mã cây như trước, vì mỗi mã cây có thời gian ra rễ khác nhau.
export function summarizeRootingWeekGroups(
  shelves: {
    id: string;
    code: string;
    name: string;
    rotationGroup: { id: string; name: string; rotationOrder: number | null } | null;
    lots: { quantity: number; enteredAt: Date; expectedMoveAt: Date | null }[];
  }[],
  now: Date = new Date()
): RootingWeekGroupStatus[] {
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
      if (lot.expectedMoveAt !== null && lot.expectedMoveAt.getTime() <= now.getTime()) entry.isDue = true;
    }
    byGroup.set(key, entry);
  }

  return Array.from(byGroup.values()).sort((a, b) => (a.rotationOrder ?? 0) - (b.rotationOrder ?? 0));
}
