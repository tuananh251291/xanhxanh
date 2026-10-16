// Key lưu trong SystemConfig (xem src/lib/inventory.ts getSystemConfig) — giá trị là chuỗi tuần ISO 8601
// dạng "YYYY-Www" (VD "2026-W27") do input type="week" sinh ra, đánh dấu tuần thực tế đầu tiên được coi
// là Nhóm tuần ra rễ 1. Xem src/app/api/settings/rotation-start-week/route.ts. Toán học xoay vòng
// (isoWeekStringToMonday, getCurrentWeekSlot) dùng chung với Nhóm tuần mẫu mẹ — xem src/lib/week-rotation.ts.
import { getCurrentWeekSlot } from "@/lib/week-rotation";
import { getRotationEpoch, getRotationEpochResolver, type RotationEpochResolver } from "@/lib/rotation-epoch";
import { addDays, addWeeks, startOfWeek } from "date-fns";

// Hạn chuyển Kho thành phẩm (Lot.expectedMoveAt) của lô cây ra rễ trên giàn Phòng ra rễ — theo lịch Nhóm
// tuần ra rễ thay vì "lên kệ + số tuần ra rễ": Kho mô bàn giao CẢ Nhóm đúng tuần Nhóm tới lượt (xem
// summarizeRootingWeekGroups, getRootingDueSlot), nên hạn của lô = CHỦ NHẬT của lượt đầu tiên SAU tuần lô
// lên kệ (lô lên kệ đúng tuần Nhóm nhận cây thì bàn giao sau N−1 tuần, VD N=4 → 3 tuần). Cả tuần tới lượt hiện "Đến hạn", hết Chủ nhật
// mà lô còn trên giàn mới "Quá hạn" (lotDueStatus). Không bắt buộc đủ PlantType.rootingWeeks — phần không đạt
// sau đánh giá chất lượng lùi sang Nhóm kế tiếp để xuất ngay tuần sau (xem PATCH
// /api/rooting-quality-evaluations/[id]). Giàn chưa thuộc Nhóm hoặc kho chưa cấu hình Tuần khởi đầu: giữ
// công thức cũ (Thứ 2 tuần lên kệ + số tuần ra rễ).
export function computeRootingExpectedMoveAt(
  rootingWeeks: number,
  enteredAt: Date,
  rotationOrder: number | null,
  totalSlots: number,
  epochMonday: Date | undefined
): Date {
  if (rotationOrder == null || !epochMonday || totalSlots <= 0) {
    return addWeeks(startOfWeek(enteredAt, { weekStartsOn: 1 }), rootingWeeks);
  }
  const enteredDueSlot = getRootingDueSlot(totalSlots, enteredAt, epochMonday);
  const weeksUntilDue = ((rotationOrder - enteredDueSlot + totalSlots) % totalSlots) || totalSlots;
  return addDays(startOfWeek(addWeeks(enteredAt, weeksUntilDue), { weekStartsOn: 1 }), 6);
}

// Nhóm tuần ra rễ ĐẾN HẠN BÀN GIAO trong tuần chứa `date`. Cây lên giàn tuần W vào Nhóm có khe
// getCurrentWeekSlot(W) (xem resolveRaReGroupAt ở shelf-assignment.ts — Nhóm vừa bàn giao xong tuần W−1,
// giàn đã trống) và bàn giao tuần W+3 = tuần cấy + 4 (cấy tuần W−1 → Phòng tối 1 tuần → lên giàn tuần W →
// 3 tuần ở Phòng ra rễ). VD Bát Tràng: cấy 28/09–03/10 → lên giàn tuần 05/10 → bàn giao tuần 26/10. Nên
// Nhóm đến hạn tuần X là Nhóm có khe của tuần X+1 — mọi nơi tính "đến hạn"/"đạt xuất" của Nhóm tuần ra rễ
// phải dùng hàm này (KHÔNG dùng getCurrentWeekSlot trực tiếp — đó là khe XẾP GIÀN).
export function getRootingDueSlot(totalSlots: number, date: Date, epochMonday: Date): number {
  return getCurrentWeekSlot(totalSlots, addWeeks(date, 1), epochMonday);
}

// Lịch bàn giao đã chạy tại tuần chứa `date` chưa — lượt bàn giao đầu tiên là tuần TRƯỚC tuần khởi đầu
// (epochMonday là tuần Nhóm 1 bắt đầu nhận cây, Nhóm đến hạn tuần đó tính theo khe tuần sau).
export function isRootingDueScheduleStarted(date: Date, epochMonday: Date): boolean {
  return addWeeks(date, 1).getTime() >= epochMonday.getTime();
}

export { isoWeekStringToMonday, getCurrentWeekSlot } from "@/lib/week-rotation";

// Giá trị CHUNG ở SystemConfig — mỗi kho có thể đặt riêng (Warehouse.rootingRotationStartWeek), xem
// src/lib/rotation-epoch.ts.
export { ROOTING_ROTATION_START_WEEK_KEY } from "@/lib/rotation-epoch";

// Đọc mốc "Tuần khởi đầu của Nhóm tuần ra rễ 1" (nếu có) cho 1 kho — giá trị riêng của kho, không có thì
// giá trị chung. Không truyền warehouseId = giá trị chung. undefined nếu chưa cấu hình gì.
export async function getRootingRotationEpoch(warehouseId?: string | null): Promise<Date | undefined> {
  return getRotationEpoch("RA_RE", warehouseId);
}

export async function getRootingRotationEpochResolver(): Promise<RotationEpochResolver> {
  return getRotationEpochResolver("RA_RE");
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
// rotationOrder của Nhóm khớp với getRootingDueSlot(totalSlots, ..., epochMonday) — totalSlots = tổng số
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
  // Đồng thời chặn cả những TUẦN CÒN TRƯỚC epochMonday — getCurrentWeekSlot tính theo mod N nên tự "quay
  // ngược" ra 1 khe hợp lệ cho tuần trước epoch (VD epoch tuần 31, N=4 thì tuần 30 bị tính thành khe 4),
  // dù lịch xoay vòng thật sự chưa bắt đầu — không có ý nghĩa gì, dễ khiến Nhóm cuối chu kỳ hiện "đạt
  // xuất" nhầm ngay trước khi lịch khởi động (xem lỗi tương tự đã sửa ở summarizeMotherWeekGroups).
  const currentSlot = totalSlots > 0 && epochMonday && isRootingDueScheduleStarted(now, epochMonday)
    ? getRootingDueSlot(totalSlots, now, epochMonday)
    : null;

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
