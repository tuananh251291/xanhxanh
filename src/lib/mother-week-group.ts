import { addWeeks, startOfWeek, endOfWeek, addDays } from "date-fns";
import { getCurrentWeekSlot } from "@/lib/week-rotation";
import { getRotationEpoch, getRotationEpochResolver, resolveRotationEpoch, type RotationEpochResolver } from "@/lib/rotation-epoch";
import { getSystemConfig } from "@/lib/inventory";

// Key lưu trong SystemConfig (giá trị CHUNG) — giá trị là chuỗi tuần ISO 8601 dạng "YYYY-Www" (VD
// "2026-W27"), đánh dấu tuần thực tế đầu tiên được coi là Nhóm tuần mẫu mẹ 1. Mỗi kho có thể đặt giá trị
// riêng (Warehouse.motherRotationStartWeek) — xem src/lib/rotation-epoch.ts.
export { MOTHER_ROTATION_START_WEEK_KEY } from "@/lib/rotation-epoch";

// Đọc mốc "Tuần khởi đầu của Nhóm tuần mẫu mẹ 1" (nếu có) cho 1 kho — giá trị riêng của kho, không có thì
// giá trị chung. Không truyền warehouseId = giá trị chung. undefined nếu chưa cấu hình gì.
export async function getMotherRotationEpoch(warehouseId?: string | null): Promise<Date | undefined> {
  return getRotationEpoch("MAU_ME", warehouseId);
}

// "Quá hạn tạm thời" — danh sách giàn mẫu mẹ (shelfId) Admin cho hiện vào danh sách đến hạn cấy chuyển
// NGOÀI lịch xoay vòng, kèm ngày hết hiệu lực (sau ngày đó tự bỏ qua, không cần dọn tay). Dùng khi 1 Nhóm
// đã lỡ hạn ra chỉ định (VD 04/10/2026: lần đầu nhập liệu Kim Động, lỡ Thứ 5 của MM4 giàn C07/C08) — Nhóm
// đã qua lượt thì summarizeMotherWeekGroups không hiện nữa (không có khái niệm "quá hạn" chung, áp chung sẽ
// làm hiện lại hàng trăm lô cũ ở kho khác). Giá trị SystemConfig: JSON {"shelfIds": [...], "until": "YYYY-MM-DD"}.
export const MOTHER_FORCED_DUE_KEY = "mother_forced_due_shelves";

export async function getForcedDueMotherShelfIds(now: Date = new Date()): Promise<Set<string>> {
  const raw = await getSystemConfig(MOTHER_FORCED_DUE_KEY, "");
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as { shelfIds?: unknown; until?: unknown };
    if (!Array.isArray(parsed.shelfIds) || typeof parsed.until !== "string") return new Set();
    const until = new Date(`${parsed.until}T23:59:59+07:00`);
    if (Number.isNaN(until.getTime()) || now.getTime() > until.getTime()) return new Set();
    return new Set(parsed.shelfIds.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export type MotherEpochResolver = RotationEpochResolver & { forcedDueShelfIds?: Set<string> };

// Bảng tra theo kho (kèm danh sách "quá hạn tạm thời") — truyền vào summarizeMotherWeekGroups.
export async function getMotherRotationEpochResolver(): Promise<MotherEpochResolver> {
  const [resolver, forcedDueShelfIds] = await Promise.all([getRotationEpochResolver("MAU_ME"), getForcedDueMotherShelfIds()]);
  return { ...resolver, forcedDueShelfIds };
}

// Hạn cấy chuyển (Lot.expectedMoveAt) cho lô mẫu mẹ NHẬP THẲNG lên giàn bằng Excel (mục 4 Giàn kệ mới, mục
// 5 Lô tồn kho hiện có) — cùng công thức computeExpectedMoveAt (dark-room-shelf-commit.ts, Kho mô xếp kệ
// khi nhận bàn giao): lần tới lượt kế tiếp của Nhóm tuần chứa kệ, tính từ ngày lô vào kệ. Khác 1 điểm:
// tồn CŨ đã nằm trên kệ từ lâu thì hạn tính ra có thể đã qua — cộng thêm đủ chu kỳ (N tuần) cho tới lần
// tới lượt GẦN NHẤT kể từ tuần này, để lô hiện đúng "đến hạn" khi Nhóm của nó tới lượt (summarizeMotherWeekGroups
// chỉ coi lô có expectedMoveAt trong tuần này/tuần sau là đến hạn). Trước đây 2 mục nhập Excel bỏ trống
// expectedMoveAt nên lô nhập Excel KHÔNG BAO GIỜ hiện đến hạn (04/10/2026: 412/412 lô mẫu mẹ Kim Động).
// Kệ chưa thuộc Nhóm hoặc chưa cấu hình Tuần khởi đầu → giống computeExpectedMoveAt: vào kệ + N tuần.
export function computeImportedMotherExpectedMoveAt(
  transferWaitWeeks: number,
  enteredAt: Date,
  rotationOrder: number | null,
  motherEpochMonday: Date | undefined,
  now: Date = new Date()
): Date {
  const totalSlots = transferWaitWeeks;
  if (rotationOrder == null || !motherEpochMonday || totalSlots <= 0) return addWeeks(enteredAt, totalSlots);
  const enteredSlot = getCurrentWeekSlot(totalSlots, enteredAt, motherEpochMonday);
  const weeksUntilDue = ((rotationOrder - enteredSlot + totalSlots) % totalSlots) || totalSlots;
  let due = startOfWeek(addWeeks(enteredAt, weeksUntilDue), { weekStartsOn: 1 });
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 });
  while (due.getTime() < thisWeek.getTime()) due = addWeeks(due, totalSlots);
  return due;
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
  // Giàn nằm trong danh sách "quá hạn tạm thời" (getForcedDueMotherShelfIds) — hiện ngoài lịch xoay vòng.
  overdue?: boolean;
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
    lots: { quantity: number; expectedMoveAt?: Date | null }[];
  }[],
  now: Date = new Date(),
  // Date = 1 mốc cho mọi kệ (đã tra sẵn cho đúng 1 kho); RotationEpochResolver = tra theo kho của từng kệ.
  motherEpoch?: Date | MotherEpochResolver
): MotherWeekGroupStatus[] {
  const forcedDueShelfIds = motherEpoch && !(motherEpoch instanceof Date) ? motherEpoch.forcedDueShelfIds : undefined;
  // Cửa sổ "đến hạn" của TỪNG LÔ (tuần này hoặc tuần sau — khớp đúng cửa sổ báo trước 1 tuần dùng để
  // tính isDue cấp Nhóm bên dưới). Nhóm "đến hạn" theo đúng lịch xoay vòng KHÔNG có nghĩa MỌI kệ trong
  // Nhóm đó đều thật sự đến hạn — kệ vừa được xếp lô mới (VD Kho mô vừa nhận cây sáng nay, đúng lúc rơi
  // vào khe đang là "tuần hiện tại" của Nhóm) có Lot.expectedMoveAt đã tính lại thành tận chu kỳ sau
  // (xem computeExpectedMoveAt, dark-room-shelf-commit.ts), nên phải lọc thêm theo expectedMoveAt của
  // CHÍNH lô đó — không thể chỉ dựa vào rotationOrder của cả Nhóm — tránh hiện nhầm kệ vừa nhập lên như
  // "sắp đến hạn cấy chuyển".
  const dueWindowStart = startOfWeek(now, { weekStartsOn: 1 });
  const dueWindowEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
  const isLotDue = (lot: { expectedMoveAt?: Date | null }) =>
    !!lot.expectedMoveAt && lot.expectedMoveAt >= dueWindowStart && lot.expectedMoveAt <= dueWindowEnd;

  // Tách thêm theo kho NẾU kho đó có tuần khởi đầu riêng (khác giá trị chung) — cùng nhãn "MM1" nhưng 2 kho
  // chạy 2 lịch khác nhau thì đến hạn ở 2 tuần khác nhau. Kho dùng giá trị chung giữ nguyên key cũ (không
  // đổi groupId → không làm bắn lại cảnh báo đã gửi, xem mother-ready.ts).
  const byGroup = new Map<string, MotherWeekGroupStatus & { totalSlots: number | null; epoch: Date | undefined; forcedLotCount: number }>();
  for (const shelf of shelves) {
    if (!shelf.rotationGroup) continue;
    const totalSlots = shelf.plantType?.transferWaitWeeks ?? null;
    const epoch = resolveRotationEpoch(motherEpoch, shelf.warehouse.id);
    const ownEpoch = motherEpoch && !(motherEpoch instanceof Date) && motherEpoch.byWarehouse.has(shelf.warehouse.id)
      && motherEpoch.byWarehouse.get(shelf.warehouse.id)!.getTime() !== motherEpoch.global?.getTime();
    const key = `${shelf.rotationGroup.id}::${totalSlots ?? "?"}${ownEpoch ? `::wh:${shelf.warehouse.id}` : ""}`;
    const entry = byGroup.get(key) ?? {
      groupId: key,
      groupName: shelf.rotationGroup.name,
      rotationOrder: shelf.rotationGroup.rotationOrder,
      shelves: [],
      lotCount: 0,
      totalQuantity: 0,
      isDue: false,
      totalSlots,
      epoch,
      forcedLotCount: 0,
    };
    // Chỉ liệt kê kệ THẬT SỰ có lô mẫu mẹ ĐẾN HẠN (đã lọc isLotDue) — 1 Nhóm xoay vòng thường có nhiều
    // kệ trống (chưa từng xếp gì, chờ dự phòng) hoặc kệ vừa mới xếp lô (chưa đến hạn) hơn số kệ thật sự
    // cần tạo chỉ định; nếu vẫn liệt kê, KY_THUAT sẽ thấy kệ đó trong danh sách "đến hạn cấy chuyển"
    // nhưng bấm "Tạo chỉ định" thì không có lô nào thật sự sẵn sàng.
    // Giàn "quá hạn tạm thời": lấy MỌI lô còn hàng (không lọc theo hạn của lô) — xem getForcedDueMotherShelfIds.
    const forced = !!forcedDueShelfIds?.has(shelf.id);
    const dueLots = forced ? shelf.lots.filter((l) => l.quantity > 0) : shelf.lots.filter(isLotDue);
    if (dueLots.length > 0) {
      const quantity = dueLots.reduce((sum, lot) => sum + lot.quantity, 0);
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
        lotCount: dueLots.length,
        quantity,
        ...(forced ? { overdue: true } : {}),
      });
      if (forced) entry.forcedLotCount += dueLots.length;
      entry.lotCount += dueLots.length;
      entry.totalQuantity += quantity;
    }
    byGroup.set(key, entry);
  }

  {
    const nextWeek = addWeeks(now, 1);
    // getCurrentWeekSlot tính theo mod N nên tự "quay ngược" ra khe hợp lệ cho cả những tuần TRƯỚC
    // motherEpochMonday (VD epoch = tuần 31, N=4 thì tuần 30 bị tính thành khe 4/MM4 dù lịch chưa bắt
    // đầu) — chặn tường minh: tuần nào còn TRƯỚC epoch thì không tính khe cho tuần đó (currentSlot/
    // nextWeekSlot = null), tránh Nhóm cuối chu kỳ (VD MM4/MM6) hiện "đến hạn" nhầm ngay trước khi lịch
    // thật sự khởi động. Riêng nextWeekSlot của đúng tuần epoch vẫn tính bình thường — đây chính là cơ
    // chế báo trước 1 tuần cho Nhóm 1 (VD tuần 30 báo trước MM1 sắp tới hạn ở tuần 31).
    for (const entry of byGroup.values()) {
      const motherEpochMonday = entry.epoch;
      if (!motherEpochMonday) continue;
      const nowInRange = now.getTime() >= motherEpochMonday.getTime();
      const nextWeekInRange = nextWeek.getTime() >= motherEpochMonday.getTime();
      if (!entry.totalSlots || entry.rotationOrder === null || entry.lotCount === 0) continue;
      const currentSlot = nowInRange ? getCurrentWeekSlot(entry.totalSlots, now, motherEpochMonday) : null;
      const nextWeekSlot = nextWeekInRange ? getCurrentWeekSlot(entry.totalSlots, nextWeek, motherEpochMonday) : null;
      entry.isDue = entry.rotationOrder === currentSlot || entry.rotationOrder === nextWeekSlot;
    }
    // Nhóm có giàn "quá hạn tạm thời" còn hàng thì luôn hiện, bất kể lịch xoay vòng.
    for (const entry of byGroup.values()) if (entry.forcedLotCount > 0) entry.isDue = true;
  }

  return Array.from(byGroup.values())
    .sort((a, b) => (a.rotationOrder ?? 0) - (b.rotationOrder ?? 0))
    .map(({ totalSlots: _totalSlots, epoch: _epoch, forcedLotCount: _forcedLotCount, ...rest }) => rest);
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
