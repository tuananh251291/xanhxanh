import { addWeeks, startOfWeek, addDays } from "date-fns";
import { getCurrentWeekSlot, isoWeekStringToMonday } from "@/lib/week-rotation";
import { getSystemConfig } from "@/lib/inventory";

// Key lưu trong SystemConfig — giá trị là chuỗi tuần ISO 8601 dạng "YYYY-Www" (VD "2026-W27"), đánh dấu
// tuần thực tế đầu tiên được coi là Nhóm tuần mẫu mẹ 1. Xem src/app/api/settings/rotation-start-week/route.ts
// và src/lib/rooting-week-group.ts (ROOTING_ROTATION_START_WEEK_KEY — cùng cơ chế, khác rotationKind).
export const MOTHER_ROTATION_START_WEEK_KEY = "mother_rotation_start_week";

// Đọc mốc "Tuần khởi đầu của Nhóm tuần mẫu mẹ 1" đã cấu hình (nếu có) — dùng làm motherEpochMonday
// truyền vào summarizeMotherWeekGroups để tính scheduledDue. undefined nếu SUPER_ADMIN chưa cấu hình gì.
export async function getMotherRotationEpoch(): Promise<Date | undefined> {
  const value = await getSystemConfig(MOTHER_ROTATION_START_WEEK_KEY, "");
  return value ? (isoWeekStringToMonday(value) ?? undefined) : undefined;
}

export type MotherWeekGroupShelf = {
  id: string;
  code: string;
  name: string;
  plantTypeCode: string | null;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  rowNumber: number | null;
  colNumber: number | null;
  // Khối vật lý (chữ cái hàng + số hàng, VD "A01") — dùng để nhóm/sắp xếp kệ theo đúng thứ tự A, B,
  // C... ngoài thực địa. rowNumber một mình KHÔNG đủ để phân biệt các hàng khác chữ cái (VD hàng "A" và
  // "B" có thể cùng rowNumber=1 nếu tạo riêng 2 lượt) — xem field Shelf.block trong schema.prisma.
  block: string | null;
  lotCount: number;
  quantity: number;
};

// Hạn chót thực tế của thông báo báo trước 1 tuần (xem summarizeMotherWeekGroups) — Thứ 5 của tuần đang
// xem thông báo (KHÔNG phải Thứ 5 của tuần thật sự đến hạn cấy chuyển), để NV kỹ thuật còn vài ngày
// chuẩn bị chỉ định trước khi tuần đến hạn bắt đầu.
export function getMotherDueDeadline(now: Date = new Date()): Date {
  return addDays(startOfWeek(now, { weekStartsOn: 1 }), 3);
}

export type MotherWeekGroupStatus = {
  groupId: string;
  groupName: string;
  rotationOrder: number | null;
  shelves: MotherWeekGroupShelf[];
  lotCount: number;
  totalQuantity: number;
  isDue: boolean;
};

// Tổng hợp theo Nhóm xoay vòng (rotationGroup, rotationKind = MAU_ME) cho các kệ "đã chia" (Phòng mẫu
// mẹ) của 1 kho — kệ chưa gán Nhóm nào bị bỏ qua hoàn toàn.
//
// "Đạt hạn cấy chuyển" (isDue) tính THUẦN theo lịch xoay vòng — KHÔNG còn dựa vào Lot.expectedMoveAt/ngày
// nhập lô nữa (đổi theo yêu cầu: đã có Nhóm tuần mẫu mẹ gắn với tuần thật cụ thể qua "Tuần khởi đầu của
// Nhóm tuần mẫu mẹ 1", không cần theo dõi ngày lô riêng lẻ). N (số khe xoay vòng) = Thời gian đợi cấy
// chuyển của mã cây gán cho Nhóm đó (lấy từ kệ đầu tiên có gán mã cây — theo quy ước 1 Nhóm tuần mẫu mẹ
// chỉ chứa 1 mã cây duy nhất, xem comment tại Shelf.rotationGroupId, nên mọi lô cùng Nhóm luôn cùng thời
// gian đợi). 1 Nhóm được coi là "đạt hạn" khi rotationOrder khớp getCurrentWeekSlot ở TUẦN NÀY hoặc TUẦN
// SAU (báo trước 1 tuần cho NV kỹ thuật kịp ra chỉ định trước khi tuần đến hạn thật sự bắt đầu — giữ đúng
// tinh thần báo trước như trước đây, hạn chót hiển thị vẫn là Thứ 5 của tuần đang xem, xem
// getMotherDueDeadline/src/lib/mother-ready.ts). Nhóm chưa có lô nào (rỗng) vẫn không được coi là "đạt
// hạn" dù đúng lịch — tránh hiện thẻ cảnh báo trống không có gì để tạo chỉ định. Luôn isDue=false nếu
// không truyền motherEpochMonday (SUPER_ADMIN chưa cấu hình "Tuần khởi đầu của Nhóm tuần mẫu mẹ 1").
export function summarizeMotherWeekGroups(
  shelves: {
    id: string;
    code: string;
    name: string;
    rowNumber: number | null;
    colNumber: number | null;
    block: string | null;
    warehouse: { id: string; code: string; name: string };
    rotationGroup: { id: string; name: string; rotationOrder: number | null } | null;
    plantType: { code: string; transferWaitWeeks?: number } | null;
    lots: { quantity: number }[];
  }[],
  now: Date = new Date(),
  motherEpochMonday?: Date
): MotherWeekGroupStatus[] {
  // Thời gian đợi cấy chuyển (số khe xoay vòng N) của 1 Nhóm — lấy từ mã cây của kệ ĐẦU TIÊN trong Nhóm
  // có gán mã cây (theo quy ước 1 Nhóm chỉ chứa 1 mã cây, xem comment trên).
  const transferWaitWeeksByGroup = new Map<string, number>();
  for (const shelf of shelves) {
    if (!shelf.rotationGroup || !shelf.plantType?.transferWaitWeeks) continue;
    if (!transferWaitWeeksByGroup.has(shelf.rotationGroup.id)) {
      transferWaitWeeksByGroup.set(shelf.rotationGroup.id, shelf.plantType.transferWaitWeeks);
    }
  }

  const byGroup = new Map<string, MotherWeekGroupStatus>();
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
      isDue: false,
    };
    const quantity = shelf.lots.reduce((sum, lot) => sum + lot.quantity, 0);
    // Chỉ liệt kê kệ THẬT SỰ có lô mẫu mẹ — 1 Nhóm xoay vòng thường có nhiều kệ trống (chưa từng xếp
    // gì, chờ dự phòng) hơn số kệ đang dùng; nếu vẫn liệt kê cả kệ trống, KY_THUAT sẽ thấy kệ đó trong
    // danh sách "đến hạn cấy chuyển" nhưng bấm "Tạo chỉ định" thì không có dữ liệu gì để chọn (không có
    // lô nào trên kệ đó).
    if (shelf.lots.length > 0) {
      entry.shelves.push({
        id: shelf.id,
        code: shelf.code,
        name: shelf.name,
        plantTypeCode: shelf.plantType?.code ?? null,
        warehouseId: shelf.warehouse.id,
        warehouseCode: shelf.warehouse.code,
        warehouseName: shelf.warehouse.name,
        rowNumber: shelf.rowNumber,
        colNumber: shelf.colNumber,
        block: shelf.block,
        lotCount: shelf.lots.length,
        quantity,
      });
    }
    for (const lot of shelf.lots) {
      entry.lotCount += 1;
      entry.totalQuantity += lot.quantity;
    }
    byGroup.set(key, entry);
  }

  if (motherEpochMonday) {
    for (const entry of byGroup.values()) {
      const totalSlots = transferWaitWeeksByGroup.get(entry.groupId);
      if (!totalSlots || entry.rotationOrder === null || entry.lotCount === 0) continue;
      const currentSlot = getCurrentWeekSlot(totalSlots, now, motherEpochMonday);
      const nextWeekSlot = getCurrentWeekSlot(totalSlots, addWeeks(now, 1), motherEpochMonday);
      entry.isDue = entry.rotationOrder === currentSlot || entry.rotationOrder === nextWeekSlot;
    }
  }

  return Array.from(byGroup.values()).sort((a, b) => (a.rotationOrder ?? 0) - (b.rotationOrder ?? 0));
}

export type MotherDueWarehouseSummary = {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  shelves: MotherWeekGroupShelf[];
  lotCount: number;
  totalQuantity: number;
};

// Gộp các kệ thuộc Nhóm tuần mẫu mẹ đã đến hạn (từ summarizeMotherWeekGroups, đã filter isDue) theo
// khu Sản xuất (Warehouse) — mỗi kho SAN_XUAT là 1 khu, giàn kệ trong từng khu xếp tăng dần theo
// rowNumber/colNumber để KY_THUAT dễ dò theo thứ tự vật lý ngoài thực địa.
export function groupDueMotherShelvesByWarehouse(dueGroups: MotherWeekGroupStatus[]): MotherDueWarehouseSummary[] {
  const byWarehouse = new Map<string, MotherDueWarehouseSummary>();
  for (const group of dueGroups) {
    for (const shelf of group.shelves) {
      const entry = byWarehouse.get(shelf.warehouseId) ?? {
        warehouseId: shelf.warehouseId,
        warehouseCode: shelf.warehouseCode,
        warehouseName: shelf.warehouseName,
        shelves: [],
        lotCount: 0,
        totalQuantity: 0,
      };
      entry.shelves.push(shelf);
      entry.lotCount += shelf.lotCount;
      entry.totalQuantity += shelf.quantity;
      byWarehouse.set(shelf.warehouseId, entry);
    }
  }

  for (const entry of byWarehouse.values()) {
    entry.shelves.sort(
      (a, b) => (a.block ?? "").localeCompare(b.block ?? "") || (a.colNumber ?? 0) - (b.colNumber ?? 0)
    );
  }

  return Array.from(byWarehouse.values()).sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode));
}
