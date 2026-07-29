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
// chuyển của mã cây trên kệ. 1 nhãn Nhóm tuần (VD "MM1") vốn được dùng CHUNG cho nhiều NV/mã cây có N
// KHÁC NHAU (không phải "1 Nhóm chỉ 1 mã cây" như giả định ban đầu — thực tế 1 kho có thể vừa có mã cây
// N=4 vừa có mã cây N=6 cùng dùng nhãn "MM1") — nên KHÔNG thể gộp chung 1 kết quả isDue cho cả nhãn:
// cùng là "MM1" nhưng N=4 và N=6 lại đại diện 2 điểm KHÁC NHAU trên 2 chu kỳ khác nhau, chỉ trùng nhau ở
// đúng tuần epoch (mọi N đều ra khe 1 ở offset 0). Vì vậy tách entry theo (rotationGroup, N) thay vì chỉ
// theo rotationGroup — có thể ra 2 entry cùng tên "MM1" (1 cho N=4, 1 cho N=6), mỗi entry tự tính đúng
// hạn theo N riêng, KHÔNG ảnh hưởng gì tới nơi dùng groupId/groupName (chỉ dùng làm nhãn hiển thị/khoá
// dedupe alert, xem mother-ready.ts) hay danh sách shelves phẳng (mother-due/[warehouseId]/page.tsx).
// 1 Nhóm được coi là "đạt hạn" khi rotationOrder khớp getCurrentWeekSlot ở TUẦN NÀY hoặc TUẦN SAU (báo
// trước 1 tuần cho NV kỹ thuật kịp ra chỉ định trước khi tuần đến hạn thật sự bắt đầu — hạn chót hiển
// thị vẫn là Thứ 5 của tuần đang xem, xem getMotherDueDeadline/src/lib/mother-ready.ts). Nhóm chưa có lô
// nào (rỗng) vẫn không được coi là "đạt hạn" dù đúng lịch — tránh hiện thẻ cảnh báo trống không có gì để
// tạo chỉ định. Luôn isDue=false nếu không truyền motherEpochMonday (SUPER_ADMIN chưa cấu hình "Tuần
// khởi đầu của Nhóm tuần mẫu mẹ 1") hoặc kệ chưa gán mã cây (không xác định được N).
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
  const byGroup = new Map<string, MotherWeekGroupStatus & { totalSlots: number | null }>();
  for (const shelf of shelves) {
    if (!shelf.rotationGroup) continue;
    const totalSlots = shelf.plantType?.transferWaitWeeks ?? null;
    const key = `${shelf.rotationGroup.id}::${totalSlots ?? "?"}`;
    const entry = byGroup.get(key) ?? {
      groupId: key,
      groupName: shelf.rotationGroup.name,
      rotationOrder: shelf.rotationGroup.rotationOrder,
      shelves: [],
      lotCount: 0,
      totalQuantity: 0,
      isDue: false,
      totalSlots,
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
    const nextWeek = addWeeks(now, 1);
    // getCurrentWeekSlot tính theo mod N nên tự "quay ngược" ra khe hợp lệ cho cả những tuần TRƯỚC
    // motherEpochMonday (VD epoch = tuần 31, N=4 thì tuần 30 bị tính thành khe 4/MM4 dù lịch chưa bắt
    // đầu) — chặn tường minh: tuần nào còn TRƯỚC epoch thì không tính khe cho tuần đó (currentSlot/
    // nextWeekSlot = null), tránh Nhóm cuối chu kỳ (VD MM4/MM6) hiện "đến hạn" nhầm ngay trước khi lịch
    // thật sự khởi động. Riêng nextWeekSlot của đúng tuần epoch vẫn tính bình thường — đây chính là cơ
    // chế báo trước 1 tuần cho Nhóm 1 (VD tuần 30 báo trước MM1 sắp tới hạn ở tuần 31).
    const nowInRange = now.getTime() >= motherEpochMonday.getTime();
    const nextWeekInRange = nextWeek.getTime() >= motherEpochMonday.getTime();
    for (const entry of byGroup.values()) {
      if (!entry.totalSlots || entry.rotationOrder === null || entry.lotCount === 0) continue;
      const currentSlot = nowInRange ? getCurrentWeekSlot(entry.totalSlots, now, motherEpochMonday) : null;
      const nextWeekSlot = nextWeekInRange ? getCurrentWeekSlot(entry.totalSlots, nextWeek, motherEpochMonday) : null;
      entry.isDue = entry.rotationOrder === currentSlot || entry.rotationOrder === nextWeekSlot;
    }
  }

  return Array.from(byGroup.values())
    .sort((a, b) => (a.rotationOrder ?? 0) - (b.rotationOrder ?? 0))
    .map(({ totalSlots: _totalSlots, ...rest }) => rest);
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
