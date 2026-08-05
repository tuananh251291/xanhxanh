import { addWeeks } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getCurrentWeekSlot, isoWeekStringToMonday, ROOTING_ROTATION_START_WEEK_KEY } from "@/lib/rooting-week-group";
import { getMotherRotationEpoch } from "@/lib/mother-week-group";
import { getSystemConfig } from "@/lib/inventory";
import { sumLotQuantity, MOTHER_SPEC_BAG_SIZE } from "@/types";

// Làm tròn xuống bội số của 1 túi (đơn vị vật lý không tách rời) khi phải chia 1 lô mẫu mẹ (M05)
// ra nhiều kệ do tràn sức chứa — sức chứa/tồn kệ tính theo CỤM (xem MOTHER_SPEC_BAG_SIZE ở src/types),
// nhưng phần đặt lên từng kệ vẫn phải là nguyên túi. Không áp dụng cho THANH_PHAM (đã tính theo cây,
// không có khái niệm "túi" khi xếp Phòng ra rễ).
function roundDownToBag(amount: number, stageCode: string): number {
  const bagSize = MOTHER_SPEC_BAG_SIZE[stageCode as keyof typeof MOTHER_SPEC_BAG_SIZE] ?? 1;
  return Math.floor(Math.max(0, amount) / bagSize) * bagSize;
}

export class ShelfAssignError extends Error {}

// Kệ "chung" khớp mã cây nếu ít nhất 1 chuỗi trong allowedCodes ("Cho phép xếp") là TIỀN TỐ của mã chi
// tiết loại cây (VD "MT" khớp mọi mã MT001/MT005/MT041..., "MT041" chỉ khớp đúng mã đó).
export function matchesAllowedCodes(allowedCodes: string[], plantTypeCode: string): boolean {
  return allowedCodes.some((code) => plantTypeCode.startsWith(code));
}

type LotForAssign = {
  id: string;
  code: string;
  stage: "MAU_ME" | "THANH_PHAM";
  stageCode: string;
  quantity: number;
  plantTypeId: string;
  plantType: { code: string; name: string; rootingWeeks: number; transferWaitWeeks: number };
  // Ngày lô THẬT SỰ vào Phòng tối (nhập nhật ký cấy hoặc nhập kho thủ công) — dùng làm mốc xác định
  // Nhóm tuần ra rễ (xem nhánh THANH_PHAM bên dưới), KHÔNG dùng ngày Transfer được tạo ("Bàn giao") vì
  // NV/Kho mô có thể gộp nhiều ngày bàn giao 1 lần, khiến khoảng cách giữa nhập kho và bàn giao thật
  // trôi dạt nhiều ngày/tuần — Nhóm tuần phải cố định theo ngày nhập, không phụ thuộc lúc nào bấm nút.
  enteredAt: Date;
  // Ngày nhập kho tối GỐC, bất biến — khác enteredAt (bị commitShelfPlacements ghi đè thành ngày lên kệ
  // lúc xác nhận). Chỉ cần truyền qua để lô con (khi bị tách do tràn kệ) giữ đúng giá trị gốc của lô cha,
  // xem dark-room-shelf-commit.ts. Null với lô tạo trước khi có field này.
  darkRoomEnteredAt: Date | null;
  instructionId: string | null;
  instruction: { assignedToId: string | null; isBackup: boolean } | null;
  // Chủ Phòng tối cá nhân đang chứa lô này (trước khi bàn giao) — dùng làm fallback xác định
  // ownerStaffId khi lô KHÔNG có chỉ định cấy (VD tạo qua "Nhập kho thủ công" ở
  // src/app/api/inventory/stock-in/route.ts, không set instructionId) nhưng vẫn nằm trong đúng Phòng
  // tối của 1 NV cụ thể — nếu không có fallback này, lô sẽ bị coi là "không có chủ" và rớt thẳng xuống
  // Kho mẫu mẹ chung dù đã nằm sẵn trong phòng của đúng NV đó.
  room: { assignedStaffId: string | null } | null;
};

type ShelfCandidate = {
  id: string;
  code: string;
  capacity: number | null;
  plantTypeId: string | null;
  assignedStaffId: string | null;
  sharedMotherPool: "QUA_HAN" | "DUNG_HAN" | null;
  allowedCodes: string[]; // "Cho phép xếp" — chỉ có ý nghĩa với kệ chung trong Phòng mẫu mẹ
  // Nhóm tuần — PHONG_RA_RE dùng để chọn "khe tuần hiện tại" (xem getCurrentWeekSlot); PHONG_MAU_ME
  // dùng để mở rộng "kệ đã chia" của 1 NV sang TẤT CẢ các Nhóm tuần mẫu mẹ khác của đúng NV đó, xét theo
  // vòng tuần hoàn (xem planShelfAssignments bên dưới) trước khi coi là dư và tràn sang Kho mẫu mẹ chung.
  rotationGroupId: string | null;
  rotationOrder: number | null; // thứ tự vòng tuần hoàn của Nhóm tuần (ShelfGroup.rotationOrder), null nếu chưa thuộc Nhóm nào
  roomType: "PHONG_MAU_ME" | "PHONG_RA_RE";
  used: number; // PHONG_RA_RE tính theo cây; PHONG_MAU_ME tính theo cụm (xem MOTHER_SPEC_BAG_SIZE)
};

export type ShelfPlacement = {
  lotId: string;
  lot: LotForAssign;
  shelfId: string;
  shelfCode: string;
  quantity: number; // đơn vị theo lot.stage — cây (THANH_PHAM/Phòng ra rễ) hoặc cụm (MAU_ME) — có thể
  // nhỏ hơn lot.quantity nếu bị chia do tràn sức chứa kệ (luôn làm tròn nguyên túi khi chia MAU_ME)
  // MANUAL = KHO_MO tự nhập kệ + số lượng (bỏ qua thuật toán), chỉ áp dụng cho mẫu mẹ — xem
  // confirmStageManual (src/lib/receive-phong-toi.ts).
  pool: "OWNED" | "SHARED" | "RA_RE" | "MANUAL";
  // Nhóm tuần mẫu mẹ của ĐÚNG kệ vừa xếp (null nếu kệ chưa thuộc Nhóm nào, hoặc không áp dụng với
  // THANH_PHAM) — dark-room-shelf-commit.ts dùng để tính hạn cấy chuyển đúng theo lịch xoay vòng của
  // kệ thật sự nhận lô, thay vì chỉ tính từ thời điểm bàn giao + số tuần chờ.
  rotationOrder: number | null;
};

/**
 * Nguyên tắc bàn giao Phòng tối → Kho sáng (KHO_MO xác nhận nhận):
 * - Cây ra rễ (THANH_PHAM) → xếp vào kệ Phòng ra rễ, ưu tiên kệ đang dùng ít nhất; nếu kệ có sức chứa
 *   (đơn vị cây) và không đủ chỗ, phần dư tự tràn sang kệ trống kế tiếp (chia lô thành nhiều dòng xếp
 *   kệ). Kệ không đặt sức chứa (capacity = null) coi như không giới hạn.
 * - Mẫu mẹ (MAU_ME, M05) → xếp vào đúng kệ của nhân viên phụ trách (Kho mẫu mẹ đã chia — kệ có
 *   assignedStaffId = NV được giao chỉ định cấy đã tạo ra lô này, và đúng mã cây; lô không có chỉ định
 *   cấy — VD tạo qua "Nhập kho thủ công" — dùng chủ Phòng tối cá nhân đang chứa lô đó làm chủ thay thế).
 *   Sức chứa kệ Phòng
 *   mẫu mẹ tính theo CỤM (Lot.quantity của M05 luôn là cụm) — khi phải chia 1 lô ra nhiều kệ do
 *   tràn sức chứa, phần đặt lên mỗi kệ luôn làm tròn xuống nguyên túi (roundDownToBag) vì túi là đơn vị
 *   vật lý không tách rời. Kệ đã chia có thể chứa nhiều lô cùng lúc (không còn giới hạn 1 lô/kệ)
 *   — chỉ giới hạn bởi sức chứa còn lại (capLeft), giống hệt cách xếp cây ra rễ.
 *   Kệ "chính" được thử TRƯỚC TIÊN là kệ thuộc đúng Nhóm tuần ĐANG TỚI LƯỢT cấy chuyển của mã cây đó
 *   ngay lúc xếp (khớp getCurrentWeekSlot theo N = transferWaitWeeks của mã cây, cùng công thức dùng ở
 *   summarizeMotherWeekGroups/computeExpectedMoveAt) — VD hôm nay đang là khe MM3 thì ưu tiên kệ thuộc
 *   MM3 trước, để lô mẫu mẹ mới bàn giao rơi đúng vào nhóm sắp cấy chuyển thay vì luôn dồn về nhóm nhỏ
 *   nhất. Rơi về kệ có rotationOrder nhỏ nhất (hành vi cũ) khi CHƯA cấu hình "Tuần khởi đầu Nhóm tuần mẫu
 *   mẹ" (SUPER_ADMIN chưa cài ở /settings/shelf-groups) hoặc NV đó không có kệ nào thuộc đúng Nhóm đang
 *   tới lượt. Nếu kệ chính đã đầy, KHÔNG coi ngay là dư — hệ thống xếp tiếp sang TẤT CẢ các Nhóm tuần
 *   mẫu mẹ KHÁC cũng của đúng NV đó, đúng mã cây (VD 1 NV có 8 kệ chia 4 Nhóm tuần MM1-MM4, mỗi nhóm 2
 *   kệ), theo thứ tự VÒNG TUẦN HOÀN bắt đầu từ Nhóm của kệ chính, tăng dần theo rotationOrder rồi quay
 *   lại từ đầu nếu hết vòng — VD kệ chính thuộc MM3 thì thứ tự xét là MM3 → MM4 → MM1 → MM2 (mỗi Nhóm chỉ
 *   xét 1 lượt/vòng). Kệ chưa thuộc Nhóm tuần nào (rotationGroupId = null) thì chỉ xếp đúng 1 kệ đó, giữ
 *   hành vi cũ. Chỉ khi hết TẤT CẢ các Nhóm của NV đó (đúng mã cây) mà vẫn còn dư mới thật sự tràn sang 1
 *   kệ Phòng mẫu mẹ chưa gán nhân viên (Kho mẫu mẹ chung) khớp "Cho phép xếp". Hệ thống tự chọn kệ, không
 *   cần KHO_MO chọn tay.
 */
export async function planShelfAssignments(
  transferItems: { lotId: string; lot: LotForAssign }[],
  warehouseId: string
): Promise<ShelfPlacement[]> {
  const shelves = await prisma.shelf.findMany({
    where: { warehouseId, isActive: true, room: { type: { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] } } },
    include: {
      room: { select: { type: true } },
      lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } },
      rotationGroup: { select: { rotationOrder: true } },
    },
  });
  // Chỉ áp dụng lọc Nhóm tuần ra rễ nếu có ít nhất 1 Nhóm xoay vòng (rotationKind=RA_RE) đã được
  // SUPER_ADMIN cấu hình ở /settings/shelf-groups VÀ kho này có kệ thuộc 1 trong các Nhóm đó — cho phép
  // các kho chưa dùng cơ chế này tiếp tục xếp theo kiểu cũ (ít dùng nhất trong toàn bộ Phòng ra rễ),
  // tương thích ngược. N (tổng số khe xoay vòng) = tổng số Nhóm rotationKind=RA_RE đang cấu hình, KHÔNG
  // còn hard-code 4 — xem getCurrentWeekSlot.
  const raReGroups = await prisma.shelfGroup.findMany({
    where: { rotationKind: "RA_RE" },
    select: { id: true, rotationOrder: true },
  });
  const startWeekValue = raReGroups.length > 0 ? await getSystemConfig(ROOTING_ROTATION_START_WEEK_KEY, "") : "";
  const epochMonday = startWeekValue ? isoWeekStringToMonday(startWeekValue) : null;
  // Xác định Nhóm tuần ra rễ "đang tới lượt" tại mốc CỐ ĐỊNH = tuần kế tiếp NGAY SAU tuần lô đó vào
  // Phòng tối (lot.enteredAt + 1 tuần) — KHÔNG dùng lúc Transfer được tạo ("Bàn giao") hay lúc Kho mô
  // xác nhận nhận: cả 2 mốc này đều là thời điểm THAO TÁC (có thể trôi dạt nhiều ngày, thậm chí cả tuần
  // so với ngày nhập thật, VD NV gộp nhiều ngày bàn giao 1 lần) — nếu dùng sẽ khiến Nhóm tuần của 1 lô
  // đổi theo tốc độ xử lý hành chính thay vì cố định theo ngày nhập, gây khó đoán trước. Từng lô trong 1
  // đợt xác nhận (đặc biệt luồng Xanh gộp nhiều phiếu) có thể có enteredAt khác nhau nên tính riêng
  // từng lô, không dùng chung 1 "hôm nay" cho cả batch.
  function resolveRaReGroupAt(atDate: Date): { id: string; rotationOrder: number | null } | "BEFORE_EPOCH" | undefined {
    if (raReGroups.length === 0) return undefined;
    // Tuần của atDate còn TRƯỚC mốc "Tuần khởi đầu Nhóm tuần ra rễ 1" đã cấu hình — lịch xoay vòng thật
    // sự CHƯA bắt đầu tại thời điểm đó. getCurrentWeekSlot tính theo mod N nên tự "quay ngược" ra 1 khe
    // hợp lệ cho tuần trước epoch (VD epoch tuần 31 thì tuần 30 bị tính thành khe cuối cùng của chu kỳ
    // trước), không có ý nghĩa gì và có thể khớp NHẦM với 1 Nhóm thật — chặn tường minh (giống hệt lỗi
    // đã sửa ở summarizeRootingWeekGroups/summarizeMotherWeekGroups).
    if (epochMonday && atDate.getTime() < epochMonday.getTime()) return "BEFORE_EPOCH";
    return raReGroups.find(
      (g) => g.rotationOrder === (epochMonday ? getCurrentWeekSlot(raReGroups.length, atDate, epochMonday) : getCurrentWeekSlot(raReGroups.length, atDate))
    );
  }
  const rootingUsesRotationGroup = shelves.some(
    (s) => s.room?.type === "PHONG_RA_RE" && s.rotationGroupId !== null
  );

  const candidates: ShelfCandidate[] = shelves.map((s) => ({
    id: s.id,
    code: s.code,
    capacity: s.capacity,
    plantTypeId: s.plantTypeId,
    assignedStaffId: s.assignedStaffId,
    sharedMotherPool: s.sharedMotherPool,
    allowedCodes: s.allowedCodes,
    rotationGroupId: s.rotationGroupId,
    rotationOrder: s.rotationGroup?.rotationOrder ?? null,
    roomType: s.room!.type as "PHONG_MAU_ME" | "PHONG_RA_RE",
    used: sumLotQuantity(s.lots),
  }));
  const usedById = new Map(candidates.map((c) => [c.id, c.used]));

  // Chỉ đọc "Tuần khởi đầu Nhóm tuần mẫu mẹ" khi batch thật sự có lô MAU_ME cần xếp kệ đã chia — dùng để
  // xác định Nhóm nào đang tới lượt cấy chuyển ngay lúc xếp (xem lựa chọn primaryOwned bên dưới).
  const motherEpochMonday = transferItems.some((i) => i.lot.stage !== "THANH_PHAM")
    ? await getMotherRotationEpoch()
    : undefined;

  const placements: ShelfPlacement[] = [];

  for (const { lotId, lot } of transferItems) {
    if (lot.stage === "THANH_PHAM") {
      let pool = candidates.filter((c) => c.roomType === "PHONG_RA_RE");
      if (pool.length === 0) throw new ShelfAssignError("Không có kệ Phòng ra rễ nào trong kho này");
      if (rootingUsesRotationGroup) {
        const resolvedGroup = resolveRaReGroupAt(addWeeks(lot.enteredAt, 1));
        if (resolvedGroup === "BEFORE_EPOCH") {
          throw new ShelfAssignError(
            `Chưa tới tuần bắt đầu lịch xoay vòng Nhóm tuần ra rễ (SUPER_ADMIN đã cấu hình ở /settings/shelf-groups nhưng còn ở tuần sau) — chưa xác định được Nhóm nào đang tới lượt`
          );
        }
        if (!resolvedGroup) {
          throw new ShelfAssignError(
            `Chưa cấu hình Nhóm tuần ra rễ nào — SUPER_ADMIN cần tạo Nhóm ở /settings/shelf-groups`
          );
        }
        const weekPool = pool.filter((c) => c.rotationGroupId === resolvedGroup.id);
        if (weekPool.length === 0) {
          throw new ShelfAssignError(
            `Chưa có kệ Phòng ra rễ nào được gán Nhóm tuần ra rễ (thứ tự ${resolvedGroup.rotationOrder}) — SUPER_ADMIN cần cấu hình ở /settings/shelf-groups`
          );
        }
        pool = weekPool;
      }
      pool.sort((a, b) => (usedById.get(a.id) ?? 0) - (usedById.get(b.id) ?? 0));

      let remainingBags = lot.quantity;
      for (const shelf of pool) {
        if (remainingBags <= 0) break;
        const capLeft = (shelf.capacity ?? Infinity) - (usedById.get(shelf.id) ?? 0);
        const placeBags = Math.max(0, Math.min(capLeft, remainingBags));
        if (placeBags <= 0) continue;
        placements.push({ lotId, lot, shelfId: shelf.id, shelfCode: shelf.code, quantity: placeBags, pool: "RA_RE", rotationOrder: null });
        usedById.set(shelf.id, (usedById.get(shelf.id) ?? 0) + placeBags);
        remainingBags -= placeBags;
      }
      if (remainingBags > 0) {
        throw new ShelfAssignError(`Không đủ chỗ ở Phòng ra rễ cho lô ${lot.code} — SUPER_ADMIN cần thêm kệ hoặc tăng sức chứa`);
      }
      continue;
    }

    // Chỉ định cấy DỰ PHÒNG (isBackup) — dù đã gắn NV lúc bàn giao (xem PATCH /api/instructions/[id]
    // nhánh assignExtraWorkRequestId), mẫu mẹ sinh ra từ đợt cấy dự phòng KHÔNG được coi là "của" NV đó
    // để gộp vào kệ đã chia cá nhân — luôn coi như KHÔNG có chủ (ownerStaffId = null), rớt thẳng xuống
    // nhánh Kho mẫu mẹ chung bên dưới. Lý do: kệ đã chia của NV được cấp phát theo chỉ tiêu SẢN LƯỢNG
    // THƯỜNG XUYÊN của họ, không tính phần việc dự phòng làm thêm/hoàn thành sớm — gộp vào sẽ làm sai
    // lệch sức chứa đã tính cho công việc chính của NV đó.
    const ownerStaffId = lot.instruction?.isBackup
      ? null
      : (lot.instruction?.assignedToId ?? lot.room?.assignedStaffId ?? null);
    let remainingBags = lot.quantity;

    if (ownerStaffId) {
      // Chọn kệ "chính" ỔN ĐỊNH thay vì kệ đầu tiên Prisma trả về (không đảm bảo thứ tự) — sắp theo
      // rotationOrder nhỏ nhất (VD Nhóm MM1 trước MM4) rồi tới mã kệ (VD C01 trước C02) làm nền tảng thứ
      // tự vòng tuần hoàn bên dưới; kệ CHÍNH thật sự (điểm bắt đầu) lại ưu tiên đúng Nhóm đang tới lượt
      // cấy chuyển tuần này (xem dueSlot bên dưới), không phải luôn rotationOrder nhỏ nhất — để cùng 1
      // tình huống luôn xếp vào đúng 1 Nhóm/kệ như nhau, không "bốc" ngẫu nhiên sang Nhóm khác giữa các
      // lần xác nhận bàn giao (đã từng gây nhầm lẫn thật — anh mong đợi MM3 nhưng hệ thống chọn MM4).
      const ownedForPlantType = candidates
        .filter((c) => c.roomType === "PHONG_MAU_ME" && c.assignedStaffId === ownerStaffId && c.plantTypeId === lot.plantTypeId)
        .sort((a, b) => (a.rotationOrder ?? Number.MAX_SAFE_INTEGER) - (b.rotationOrder ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code));
      // Nhóm tuần đang tới lượt cấy chuyển NGAY LÚC XẾP (không phải lúc lô nhập kho tối) — dùng đúng N =
      // transferWaitWeeks của mã cây trên lô, cùng công thức summarizeMotherWeekGroups/computeExpectedMoveAt
      // đã dùng, để nhất quán với chỗ báo "đến hạn" cho KY_THUAT và chỗ tính hạn cấy chuyển của lô.
      const totalSlots = lot.plantType.transferWaitWeeks;
      const dueSlot = motherEpochMonday && totalSlots > 0 ? getCurrentWeekSlot(totalSlots, new Date(), motherEpochMonday) : null;
      const primaryOwned = (dueSlot !== null ? ownedForPlantType.find((c) => c.rotationOrder === dueSlot) : undefined) ?? ownedForPlantType[0];
      if (primaryOwned) {
        // Kệ đầu tiên tìm được đầy thì thử tiếp sang các Nhóm tuần mẫu mẹ KHÁC cũng của đúng NV này,
        // đúng mã cây — theo thứ tự VÒNG TUẦN HOÀN bắt đầu từ Nhóm của kệ tìm thấy đầu tiên, tăng dần
        // rotationOrder rồi quay lại từ Nhóm nhỏ nhất nếu hết vòng (VD kệ đầu tiên ở Nhóm rotationOrder=2,
        // có 4 Nhóm order 1-4 -> thứ tự xét Nhóm: 2,3,4,1) — mỗi Nhóm chỉ xét 1 lượt/lượt quay (xem vòng
        // lặp while bên dưới). Chỉ hết sạch mọi Nhóm của NV đó mới thật sự coi là dư. Kệ chưa gán Nhóm
        // tuần nào thì chỉ xét đúng 1 kệ đó, giữ hành vi cũ.
        let orderedOwnedShelves: ShelfCandidate[];
        if (primaryOwned.rotationGroupId) {
          const groupedOwnedShelves = candidates.filter(
            (c) =>
              c.roomType === "PHONG_MAU_ME" &&
              c.assignedStaffId === ownerStaffId &&
              c.plantTypeId === lot.plantTypeId &&
              c.rotationGroupId !== null
          );
          const groupOrderById = new Map<string, number>();
          for (const c of groupedOwnedShelves) {
            if (c.rotationGroupId !== null && c.rotationOrder !== null && !groupOrderById.has(c.rotationGroupId)) {
              groupOrderById.set(c.rotationGroupId, c.rotationOrder);
            }
          }
          const primaryOrder = primaryOwned.rotationOrder ?? 0;
          // Nhóm có rotationOrder >= Nhóm hiện tại xét trước (theo thứ tự tăng dần); Nhóm có
          // rotationOrder nhỏ hơn coi như "đã qua 1 vòng", xét sau cùng — tạo hiệu ứng vòng tuần hoàn.
          const orderedGroupIds = Array.from(groupOrderById.entries())
            .sort(([, orderA], [, orderB]) => {
              const rankA = orderA >= primaryOrder ? orderA : orderA + 1_000_000;
              const rankB = orderB >= primaryOrder ? orderB : orderB + 1_000_000;
              return rankA - rankB;
            })
            .map(([groupId]) => groupId);
          orderedOwnedShelves = orderedGroupIds.flatMap((groupId) =>
            groupedOwnedShelves.filter((c) => c.rotationGroupId === groupId).sort((a, b) => a.code.localeCompare(b.code))
          );
        } else {
          orderedOwnedShelves = [primaryOwned];
        }

        // Quay vòng THẬT SỰ qua danh sách Nhóm đã sắp — hết 1 lượt mà vẫn còn dư thì quay lại từ đầu
        // danh sách tiếp tục lượt kế tiếp, không giới hạn cứng "mỗi Nhóm chỉ xét 1 lần". Cần thế vì sức
        // chứa các Nhóm không cố định — mẫu mẹ của tuần trước tới hạn sẽ được xuất đi (bàn giao/cấy lại),
        // nên 1 kệ đang đầy lúc đầu vòng có thể vừa kịp trống ra ngay trong lúc đang xếp. Chỉ dừng vòng
        // lặp khi remainingBags = 0 (xếp xong) hoặc 1 lượt trọn vẹn không xếp thêm được cụm nào (capacity
        // thật sự đã hết ở mọi Nhóm — dừng để không treo vòng lặp vô hạn thật).
        let madeProgressThisLap = orderedOwnedShelves.length > 0;
        while (remainingBags > 0 && madeProgressThisLap) {
          madeProgressThisLap = false;
          for (const shelf of orderedOwnedShelves) {
            if (remainingBags <= 0) break;
            const capLeft = (shelf.capacity ?? Infinity) - (usedById.get(shelf.id) ?? 0);
            const placeBags = roundDownToBag(Math.min(capLeft, remainingBags), lot.stageCode);
            if (placeBags <= 0) continue;
            placements.push({ lotId, lot, shelfId: shelf.id, shelfCode: shelf.code, quantity: placeBags, pool: "OWNED", rotationOrder: shelf.rotationOrder });
            usedById.set(shelf.id, (usedById.get(shelf.id) ?? 0) + placeBags);
            remainingBags -= placeBags;
            madeProgressThisLap = true;
          }
        }
      }
    }

    if (remainingBags > 0) {
      // Hàng dư trả về Kho mẫu mẹ chung (sản xuất hàng ngày vượt chỗ kệ đã chia) mặc định vào Kho đúng
      // hạn — ưu tiên kệ đã gắn cờ DUNG_HAN, chỉ dùng kệ chung chưa gắn cờ nếu chưa có kệ nào DUNG_HAN
      // (tương thích ngược lúc SUPER_ADMIN chưa phân loại hết kệ). Khớp theo "Cho phép xếp" (allowedCodes,
      // tiền tố mã cây) thay cho plantTypeId — kệ chung không còn gán 1 mã cây cố định. Kệ CHƯA cấu hình
      // "Cho phép xếp" (allowedCodes rỗng) coi như nhận mọi mã cây — giống hệt planSurplusPlacement bên
      // dưới, để không chặn cứng luồng bàn giao hàng ngày khi SUPER_ADMIN chưa kịp cấu hình kệ chung nào.
      const chungPool = candidates.filter(
        (c) =>
          c.roomType === "PHONG_MAU_ME" &&
          !c.assignedStaffId &&
          c.sharedMotherPool !== "QUA_HAN" &&
          (c.allowedCodes.length === 0 || matchesAllowedCodes(c.allowedCodes, lot.plantType.code))
      );
      // Ưu tiên kệ còn nhiều chỗ trống nhất, đủ chứa hết phần dư nếu có; trong đó ưu tiên kệ DUNG_HAN trước.
      chungPool.sort((a, b) => {
        const poolRank = (c: ShelfCandidate) => (c.sharedMotherPool === "DUNG_HAN" ? 0 : 1);
        const rankDiff = poolRank(a) - poolRank(b);
        if (rankDiff !== 0) return rankDiff;
        const leftA = (a.capacity ?? Infinity) - (usedById.get(a.id) ?? 0);
        const leftB = (b.capacity ?? Infinity) - (usedById.get(b.id) ?? 0);
        return leftB - leftA;
      });
      const target = chungPool[0];
      if (!target) {
        throw new ShelfAssignError(
          `Không có kệ Phòng mẫu mẹ chung nào cho phép xếp mã cây ${lot.plantType.code} — SUPER_ADMIN cần cấu hình "Cho phép xếp" cho 1 kệ chung`
        );
      }
      const capLeft = (target.capacity ?? Infinity) - (usedById.get(target.id) ?? 0);
      if (capLeft < remainingBags) {
        throw new ShelfAssignError(`Kệ ${target.code} (Kho mẫu mẹ chung) không đủ chỗ cho phần dư của lô ${lot.code}`);
      }
      placements.push({ lotId, lot, shelfId: target.id, shelfCode: target.code, quantity: remainingBags, pool: "SHARED", rotationOrder: target.rotationOrder });
      usedById.set(target.id, (usedById.get(target.id) ?? 0) + remainingBags);
    }
  }

  return placements;
}

/**
 * Xếp kệ cho "MM dư" (mẫu mẹ dư) khi CAY_MO bàn giao lúc chỉ định kết thúc do hết thời gian — luôn đưa
 * thẳng vào kệ Kho quá hạn (sharedMotherPool = QUA_HAN) trong Kho mẫu mẹ chung, không đụng tới kệ "đã
 * chia" của bất kỳ NV nào (khác với planShelfAssignments dùng cho bàn giao sản lượng hàng ngày).
 */
export async function planSurplusPlacement(
  transferItems: { lotId: string; lot: LotForAssign }[],
  warehouseId: string
): Promise<ShelfPlacement[]> {
  const shelves = await prisma.shelf.findMany({
    where: {
      warehouseId,
      isActive: true,
      room: { type: "PHONG_MAU_ME" },
      assignedStaffId: null,
      sharedMotherPool: "QUA_HAN",
    },
    select: {
      id: true,
      code: true,
      capacity: true,
      allowedCodes: true,
      lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } },
      rotationGroup: { select: { rotationOrder: true } },
    },
  });

  const usedById = new Map(shelves.map((s) => [s.id, sumLotQuantity(s.lots)]));

  const placements: ShelfPlacement[] = [];

  for (const { lotId, lot } of transferItems) {
    let remainingBags = lot.quantity;

    // Khớp theo "Cho phép xếp" (allowedCodes, tiền tố mã cây) — kệ chưa cấu hình (mảng rỗng) coi như
    // nhận mọi mã cây, giữ tương thích ngược giống hành vi cũ của plantTypeId = null.
    const pool = shelves
      .filter((s) => s.allowedCodes.length === 0 || matchesAllowedCodes(s.allowedCodes, lot.plantType.code))
      .sort((a, b) => {
        const leftA = (a.capacity ?? Infinity) - (usedById.get(a.id) ?? 0);
        const leftB = (b.capacity ?? Infinity) - (usedById.get(b.id) ?? 0);
        return leftB - leftA;
      });

    for (const shelf of pool) {
      if (remainingBags <= 0) break;
      const capLeft = (shelf.capacity ?? Infinity) - (usedById.get(shelf.id) ?? 0);
      const placeBags = roundDownToBag(Math.min(capLeft, remainingBags), lot.stageCode);
      if (placeBags <= 0) continue;
      placements.push({ lotId, lot, shelfId: shelf.id, shelfCode: shelf.code, quantity: placeBags, pool: "SHARED", rotationOrder: shelf.rotationGroup?.rotationOrder ?? null });
      usedById.set(shelf.id, (usedById.get(shelf.id) ?? 0) + placeBags);
      remainingBags -= placeBags;
    }

    if (remainingBags > 0) {
      throw new ShelfAssignError(
        `Không đủ chỗ ở Kho quá hạn (Kho mẫu mẹ chung) cho lô MM dư ${lot.code} — SUPER_ADMIN cần gắn thêm kệ chung vào Kho quá hạn`
      );
    }
  }

  return placements;
}
