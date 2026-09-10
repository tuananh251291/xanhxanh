import { prisma } from "@/lib/prisma";
import { generateLotCode, generateTransferCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { RND_OUTPUT_TRANSFER_TAG } from "@/types";
import { ShelfAssignError, matchesAllowedCodes } from "@/lib/shelf-assignment";

// Bàn giao SẢN PHẨM R&D (mẫu mẹ hoặc thành phẩm, Admin kỹ thuật tự cấy tại "Kho SX R&D") sang 1 kho sản
// xuất THẬT khác — mô phỏng src/lib/mother-warehouse-transfer.ts (tag riêng trong notes + hàng đợi/xác
// nhận riêng, KHÔNG qua receive-phong-toi/do-lane vì pipeline đó hard-code giả định "phòng nguồn cùng kho
// với người xem", sẽ không hiện phiếu liên kho cho đúng Kho mô kho đích). Khác mother-warehouse-transfer
// ở chỗ nguồn là Phòng tối cá nhân của Admin kỹ thuật (không qua giàn kệ, không FIFO nhiều lô) — mỗi lô
// chọn gửi TOÀN BỘ số lượng hiện có, không tách lẻ.
export async function sendRndOutputToWarehouse(params: {
  lotIds: string[];
  toWarehouseId: string;
  fromUserId: string;
  notes?: string;
}): Promise<{ transferCode: string; toWarehouseName: string; totalQuantity: number }> {
  const { lotIds, toWarehouseId, fromUserId, notes } = params;
  if (lotIds.length === 0) throw new ShelfAssignError("Cần chọn ít nhất 1 lô để bàn giao");

  const lots = await prisma.lot.findMany({
    where: { id: { in: lotIds } },
    include: { room: { select: { id: true, type: true, assignedStaffId: true, warehouseId: true, warehouse: { select: { isRnd: true, name: true } } } } },
  });
  if (lots.length !== lotIds.length) throw new ShelfAssignError("Có lô không tồn tại");

  const invalid = lots.find(
    (l) => !l.room || l.room.type !== "PHONG_TOI" || l.room.assignedStaffId !== fromUserId || !l.room.warehouse.isRnd
  );
  if (invalid) throw new ShelfAssignError(`Lô ${invalid.code} không thuộc Phòng tối R&D của bạn`);
  if (lots.some((l) => !l.inspectedAt)) throw new ShelfAssignError("Cần kiểm tra nhiễm trước khi bàn giao");
  if (lots.some((l) => l.quantity <= 0)) throw new ShelfAssignError("Có lô đã hết số lượng, không thể bàn giao");

  const stage = lots[0].stage;
  if (lots.some((l) => l.stage !== stage)) {
    throw new ShelfAssignError("Chỉ bàn giao được các lô CÙNG loại (mẫu mẹ hoặc thành phẩm) trong 1 phiếu — mẫu mẹ và thành phẩm cần gửi thành 2 phiếu riêng");
  }

  const toWarehouse = await prisma.warehouse.findFirst({
    where: { id: toWarehouseId, type: "SAN_XUAT", isActive: true, isRnd: false },
    select: { id: true, name: true },
  });
  if (!toWarehouse) throw new ShelfAssignError("Không tìm thấy kho sản xuất đích đang hoạt động");

  const fromRoom = lots[0].room!;
  const totalQuantity = lots.reduce((s, l) => s + l.quantity, 0);

  const transfer = await prisma.$transaction(async (tx) => {
    for (const lot of lots) {
      await tx.lot.update({ where: { id: lot.id }, data: { quantity: 0 } });
    }
    return tx.transfer.create({
      data: {
        code: await generateTransferCode(tx),
        fromWarehouseId: fromRoom.warehouseId,
        fromRoomId: fromRoom.id,
        toWarehouseId,
        toRoomId: null,
        fromUserId,
        toUserId: null,
        status: "PENDING",
        notes: notes ? `${RND_OUTPUT_TRANSFER_TAG}|${notes}` : RND_OUTPUT_TRANSFER_TAG,
        items: { create: lots.map((l) => ({ lotId: l.id, quantity: l.quantity })) },
      },
    });
  });

  const destStaff = await prisma.user.findMany({
    where: { role: "KHO_MO", workplaceWarehouseId: toWarehouseId, isActive: true },
    select: { id: true },
  });
  await Promise.all(
    destStaff.map((u) =>
      createAlert({
        type: "LOT_READY_TRANSFER",
        title: "Có phiếu bàn giao từ R&D chờ nhận",
        message: `Kho SX R&D đã gửi phiếu ${transfer.code} — ${totalQuantity.toLocaleString("vi-VN")} cụm, chờ xác nhận nhập kho`,
        userId: u.id,
        relatedId: transfer.id,
        relatedType: "Transfer",
      })
    )
  );

  return { transferCode: transfer.code, toWarehouseName: toWarehouse.name, totalQuantity };
}

export async function confirmRndOutputReceipt(params: {
  transferId: string;
  toShelfCode: string;
  workplaceWarehouseId: string;
  confirmedByUserId: string;
}): Promise<{ createdLotCodes: string[] }> {
  const { transferId, toShelfCode, workplaceWarehouseId, confirmedByUserId } = params;

  const confirmedByUser = await prisma.user.findUnique({ where: { id: confirmedByUserId }, select: { code: true } });
  const confirmedByCode = confirmedByUser?.code ?? confirmedByUserId.slice(0, 6);

  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId, notes: { startsWith: RND_OUTPUT_TRANSFER_TAG }, toWarehouseId: workplaceWarehouseId, status: "PENDING" },
    include: {
      items: {
        include: { lot: { select: { plantTypeId: true, stage: true, stageCode: true, plantType: { select: { code: true } } } } },
      },
    },
  });
  if (!transfer) throw new ShelfAssignError("Không tìm thấy phiếu bàn giao R&D đang chờ xác nhận");
  if (transfer.items.length === 0) throw new ShelfAssignError("Phiếu không có lô nào");

  const stage = transfer.items[0].lot.stage;
  const roomType = stage === "MAU_ME" ? "PHONG_MAU_ME" : "PHONG_RA_RE";

  const toShelf = await prisma.shelf.findFirst({
    where: { code: toShelfCode.trim().toUpperCase(), warehouseId: workplaceWarehouseId, isActive: true, room: { type: roomType } },
    select: {
      id: true, code: true, capacity: true, assignedStaffId: true, plantTypeId: true, allowedCodes: true,
      lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
    },
  });
  if (!toShelf) {
    throw new ShelfAssignError(
      `Không tìm thấy giàn ${roomType === "PHONG_MAU_ME" ? "Phòng mẫu mẹ" : "Phòng ra rễ"} đang hoạt động thuộc kho này với mã: ${toShelfCode}`
    );
  }

  for (const item of transfer.items) {
    const plantTypeCode = item.lot.plantType.code;
    if (toShelf.assignedStaffId) {
      if (toShelf.plantTypeId !== item.lot.plantTypeId) {
        throw new ShelfAssignError(`Giàn ${toShelf.code} đã gán riêng cho 1 NV và chỉ nhận đúng 1 mã cây — không khớp mã cây ${plantTypeCode}`);
      }
    } else if (toShelf.allowedCodes.length > 0 && !matchesAllowedCodes(toShelf.allowedCodes, plantTypeCode)) {
      throw new ShelfAssignError(`Giàn ${toShelf.code} không cho phép xếp mã cây ${plantTypeCode} — Cho phép xếp: ${toShelf.allowedCodes.join(", ")}`);
    }
  }
  const totalIncoming = transfer.items.reduce((s, i) => s + i.quantity, 0);
  if (toShelf.capacity !== null) {
    const capLeft = toShelf.capacity - toShelf.lots.reduce((s, l) => s + l.quantity, 0);
    if (totalIncoming > capLeft) {
      throw new ShelfAssignError(`Giàn ${toShelf.code} không đủ chỗ — còn trống ${Math.max(0, capLeft).toLocaleString("vi-VN")}, cần xếp ${totalIncoming.toLocaleString("vi-VN")}`);
    }
  }

  const createdLotCodes: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      const code = await generateLotCode({ plantTypeCode: item.lot.plantType.code, staffCode: confirmedByCode, stageCode: item.lot.stageCode, client: tx });
      await tx.lot.create({
        data: {
          code,
          plantTypeId: item.lot.plantTypeId,
          stage: item.lot.stage,
          stageCode: item.lot.stageCode,
          shelfId: toShelf.id,
          quantity: item.quantity,
          initialQuantity: item.quantity,
          status: "ACTIVE",
          enteredAt: new Date(),
        },
      });
      createdLotCodes.push(code);
    }
    await tx.transferItem.updateMany({ where: { transferId: transfer.id }, data: { confirmedAt: new Date() } });
    await tx.transfer.update({ where: { id: transfer.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  });

  return { createdLotCodes };
}
