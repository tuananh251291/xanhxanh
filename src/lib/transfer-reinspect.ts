import { prisma } from "@/lib/prisma";
import { creditContaminationStaffBalance } from "@/lib/contamination-room";

// "Kiểm tra lại" phiếu bàn giao Phòng tối (luồng Đỏ/Vàng) — Kho mô nhập sai kết quả kiểm tra (VD báo nhiễm
// cả lô, phiếu BG-202610-0368/0585) thì tự mở lại được, không cần nhờ sửa dữ liệu tay.
//
// Kết quả kiểm tra lưu theo (mã cây + quy cách) — TransferInspectionItem. Một phiếu có thể đã xếp kệ xong
// một phần: dòng ĐÃ XẾP KỆ giữ nguyên kết quả kiểm tra (đã xếp đúng số đó lên kệ, SL ghi nhận của NV vẫn
// phải còn), chỉ mở lại các dòng CHƯA xếp. Vì vậy "phiếu đã kiểm tra chưa" không còn là có/không có
// TransferInspection nữa, mà là: mọi dòng đang chờ xếp đều đã có kết quả kiểm tra cho đúng nhóm của nó.

const keyOf = (plantTypeId: string, stageCode: string) => `${plantTypeId}|${stageCode}`;

// Các dòng đang chờ xếp (confirmedAt null) mà nhóm (mã cây + quy cách) CHƯA có kết quả kiểm tra — cần đi
// qua bước Kiểm tra trước khi Sắp xếp về kho. Rỗng = đã kiểm tra đủ.
export function uninspectedPendingItems<T extends { lot: { plantTypeId: string; stageCode: string } }>(
  pendingItems: T[],
  inspection: { items: { plantTypeId: string; stageCode: string }[] } | null
): T[] {
  const inspected = new Set((inspection?.items ?? []).map((i) => keyOf(i.plantTypeId, i.stageCode)));
  return pendingItems.filter((i) => !inspected.has(keyOf(i.lot.plantTypeId, i.lot.stageCode)));
}

export class ReinspectError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// Mở lại kết quả kiểm tra của các dòng CHƯA xếp kệ: hoàn số nhiễm đã trừ về lô, trừ lại khỏi Phòng nhiễm +
// số dư "chờ xử lý" của NV (ngược đúng addToContaminationRoom ở POST .../inspect), mở lại dòng đã đóng
// với SL 0 (lô bị báo nhiễm hết, xác nhận nhưng không xếp kệ nào), xoá kết quả kiểm tra của các nhóm đó.
export async function reopenTransferInspection(transferId: string, workplaceWarehouseId: string) {
  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId, fromRoom: { type: "PHONG_TOI", warehouseId: workplaceWarehouseId } },
    select: {
      id: true, code: true, status: true, fromUserId: true,
      fromRoom: { select: { warehouseId: true } },
      items: {
        select: {
          id: true, confirmedAt: true,
          lot: { select: { id: true, code: true, plantTypeId: true, stageCode: true, shelfId: true, room: { select: { type: true } } } },
        },
      },
      inspection: { select: { id: true, items: { select: { id: true, plantTypeId: true, stageCode: true } } } },
    },
  });
  if (!transfer) throw new ReinspectError("Không tìm thấy phiếu bàn giao", 404);
  if (transfer.status !== "PENDING") throw new ReinspectError(`Phiếu ${transfer.code} đã sắp xếp về kho xong — không thể kiểm tra lại`);
  if (!transfer.inspection) throw new ReinspectError(`Phiếu ${transfer.code} chưa được kiểm tra`);

  // Dòng "đã xếp kệ" = đã xác nhận VÀ lô đã rời Phòng tối (lên kệ). Dòng xác nhận mà lô vẫn nằm ở Phòng
  // tối, không có kệ = lô còn 0 bị đóng dòng (xem place-board.tsx) — mở lại được.
  const isPlaced = (i: (typeof transfer.items)[number]) => !!i.confirmedAt && (!!i.lot.shelfId || i.lot.room?.type !== "PHONG_TOI");
  const placedKeys = new Set(transfer.items.filter(isPlaced).map((i) => keyOf(i.lot.plantTypeId, i.lot.stageCode)));
  const reopenItems = transfer.items.filter((i) => !isPlaced(i));
  if (reopenItems.length === 0) throw new ReinspectError(`Mọi lô trong phiếu ${transfer.code} đã xếp kệ — không còn gì để kiểm tra lại`);
  const reopenKeys = new Set(reopenItems.map((i) => keyOf(i.lot.plantTypeId, i.lot.stageCode)));
  const mixed = [...reopenKeys].find((k) => placedKeys.has(k));
  if (mixed) {
    const sample = reopenItems.find((i) => keyOf(i.lot.plantTypeId, i.lot.stageCode) === mixed)!;
    throw new ReinspectError(`Quy cách ${sample.lot.stageCode} của phiếu ${transfer.code} đã xếp kệ một phần — không thể kiểm tra lại`);
  }

  // Số nhiễm Kho mô đã trừ của từng lô (mỗi lô chỉ thuộc 1 phiếu bàn giao, nên mọi dòng RED_LANE_INSPECTION
  // của lô đó đều là của lần kiểm tra này).
  const lotIds = reopenItems.map((i) => i.lot.id);
  const entries = await prisma.contaminationRoomEntry.findMany({
    where: { reason: "RED_LANE_INSPECTION", sourceLotId: { in: lotIds } },
    select: { id: true, contaminationLotId: true, quantity: true, sourceLotId: true },
  });
  const lotById = new Map(reopenItems.map((i) => [i.lot.id, i.lot]));

  // Phòng nhiễm / số dư NV còn đủ để trừ lại chưa (có thể đã bị gửi đề xuất Trồng/Hủy xử lý mất) — kiểm tra
  // trước khi đổi gì, không đủ thì chặn hẳn.
  const needByPool = new Map<string, number>();
  const needByBalance = new Map<string, { plantTypeId: string; stageCode: string; amount: number }>();
  for (const e of entries) {
    needByPool.set(e.contaminationLotId, (needByPool.get(e.contaminationLotId) ?? 0) + e.quantity);
    const lot = lotById.get(e.sourceLotId!)!;
    const k = keyOf(lot.plantTypeId, lot.stageCode);
    const b = needByBalance.get(k) ?? { plantTypeId: lot.plantTypeId, stageCode: lot.stageCode, amount: 0 };
    b.amount += e.quantity;
    needByBalance.set(k, b);
  }
  const warehouseId = transfer.fromRoom!.warehouseId!;
  const [pools, balances] = await Promise.all([
    prisma.lot.findMany({ where: { id: { in: [...needByPool.keys()] } }, select: { id: true, quantity: true, stageCode: true, plantType: { select: { code: true } } } }),
    prisma.contaminationStaffBalance.findMany({ where: { warehouseId, staffId: transfer.fromUserId, category: "LO_BAN_GIAO" } }),
  ]);
  for (const [poolId, amount] of needByPool) {
    const pool = pools.find((p) => p.id === poolId);
    if (!pool || pool.quantity < amount) {
      throw new ReinspectError(
        `Phòng nhiễm không còn đủ để hoàn lại (${pool?.plantType.code ?? ""} ${pool?.stageCode ?? ""}: cần ${amount}, còn ${pool?.quantity ?? 0}) — có thể đã gửi đề xuất Trồng/Hủy`,
        409
      );
    }
  }
  for (const b of needByBalance.values()) {
    const bal = balances.find((x) => x.plantTypeId === b.plantTypeId && x.stageCode === b.stageCode);
    if (!bal || bal.quantity < b.amount) {
      throw new ReinspectError(`Số nhiễm chờ xử lý của NV không còn đủ để hoàn lại (${b.stageCode}: cần ${b.amount}, còn ${bal?.quantity ?? 0})`, 409);
    }
  }

  const inspectionItemIds = transfer.inspection.items.filter((i) => reopenKeys.has(keyOf(i.plantTypeId, i.stageCode))).map((i) => i.id);
  const keepInspection = transfer.inspection.items.length > inspectionItemIds.length;

  await prisma.$transaction(async (tx) => {
    for (const e of entries) {
      await tx.lot.update({ where: { id: e.sourceLotId! }, data: { quantity: { increment: e.quantity } } });
      await tx.lot.update({ where: { id: e.contaminationLotId }, data: { quantity: { decrement: e.quantity }, initialQuantity: { decrement: e.quantity } } });
    }
    for (const b of needByBalance.values()) {
      await creditContaminationStaffBalance(tx, {
        warehouseId, staffId: transfer.fromUserId, plantTypeId: b.plantTypeId, stageCode: b.stageCode, category: "LO_BAN_GIAO", quantity: -b.amount,
      });
    }
    // Xoá hẳn dòng lịch sử Phòng nhiễm của lần kiểm tra sai (cùng cách xoá kết quả kiểm tra bên dưới) —
    // coi như lần nhập đó chưa từng có, lần kiểm tra lại sẽ ghi dòng mới.
    await tx.contaminationRoomEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
    await tx.transferItem.updateMany({ where: { id: { in: reopenItems.filter((i) => i.confirmedAt).map((i) => i.id) } }, data: { confirmedAt: null } });
    await tx.transferInspectionItem.deleteMany({ where: { id: { in: inspectionItemIds } } });
    if (!keepInspection) await tx.transferInspection.delete({ where: { id: transfer.inspection!.id } });
    // Thông báo "Có kết quả kiểm tra" cũ đã sai — lần kiểm tra lại sẽ gửi thông báo mới.
    await tx.alert.deleteMany({ where: { relatedId: transfer.id, type: "INSPECTION_RESULT_READY" } });
  });

  return { code: transfer.code, reopenedLots: reopenItems.length, keptPlacedGroups: placedKeys.size };
}
