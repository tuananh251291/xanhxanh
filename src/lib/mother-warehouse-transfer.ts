import { prisma } from "@/lib/prisma";
import { generateLotCode, generateTransferCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { MOTHER_WAREHOUSE_TRANSFER_TAG } from "@/types";
import { ShelfAssignError, matchesAllowedCodes } from "@/lib/shelf-assignment";

// Bàn giao mẫu mẹ LIÊN KHO sản xuất — khác mother-stock-reshelf.ts (chuyển giàn trong CÙNG 1 kho, không
// đụng tồn) và khác SURPLUS_TRANSFER_TAG (MM dư tự động khi chỉ định kết thúc, không cho tự chọn đích).
// Ở đây: KHO_MO kho nguồn chọn giàn + loại cây/quy cách + số lượng + kho sản xuất khác làm đích → trừ
// tồn giàn nguồn NGAY (hàng đã rời kho vật lý), tạo Transfer PENDING. KHO_MO kho đích xác nhận SỐ LƯỢNG
// THỰC TẾ NHẬN (có thể thấp hơn số gửi do hao hụt vận chuyển) — CHỈ lúc đó mới tạo lô mới thật sự cộng
// vào tồn kho đích; không có "Từ chối" — mọi phiếu chỉ đóng qua xác nhận (kể cả xác nhận 0 cụm).

export async function sendMotherStockToWarehouse(params: {
  fromShelfCode: string;
  plantTypeId: string;
  stageCode: string;
  quantity: number;
  toWarehouseId: string;
  fromUserId: string;
  workplaceWarehouseId: string;
  notes?: string;
}): Promise<{ transferCode: string; fromShelfCode: string; toWarehouseName: string; quantity: number }> {
  const { fromShelfCode, plantTypeId, stageCode, quantity, toWarehouseId, fromUserId, workplaceWarehouseId, notes } = params;

  if (quantity <= 0) throw new ShelfAssignError("Số cụm bàn giao phải lớn hơn 0");
  if (toWarehouseId === workplaceWarehouseId) throw new ShelfAssignError("Kho đích phải khác kho đang làm việc");

  const fromShelf = await prisma.shelf.findFirst({
    where: { code: fromShelfCode.trim().toUpperCase(), warehouseId: workplaceWarehouseId, isActive: true, room: { type: "PHONG_MAU_ME" } },
    select: { id: true, code: true, roomId: true },
  });
  if (!fromShelf) {
    throw new ShelfAssignError(`Không tìm thấy giàn Phòng mẫu mẹ đang hoạt động thuộc kho này với mã: ${fromShelfCode}`);
  }

  const [toWarehouse, fromWarehouse] = await Promise.all([
    prisma.warehouse.findFirst({ where: { id: toWarehouseId, type: "SAN_XUAT", isActive: true }, select: { id: true, name: true } }),
    prisma.warehouse.findUnique({ where: { id: workplaceWarehouseId }, select: { name: true } }),
  ]);
  if (!toWarehouse) throw new ShelfAssignError("Không tìm thấy kho sản xuất đích đang hoạt động");

  const sourceLots = await prisma.lot.findMany({
    where: { shelfId: fromShelf.id, status: "ACTIVE", stage: "MAU_ME", plantTypeId, stageCode },
    include: {
      plantType: { select: { code: true, name: true } },
      instructionItems: {
        where: { instruction: { status: { in: ["ACTIVE", "DRAFT"] }, handedOverAt: null } },
        select: { instruction: { select: { code: true } } },
      },
    },
    orderBy: { enteredAt: "asc" },
  });
  const totalAvailable = sourceLots.reduce((s, l) => s + l.quantity, 0);
  if (sourceLots.length === 0 || totalAvailable === 0) {
    throw new ShelfAssignError(`Giàn ${fromShelf.code} hiện không có mẫu mẹ loại cây/quy cách này`);
  }
  if (quantity > totalAvailable) {
    throw new ShelfAssignError(
      `Số cụm bàn giao (${quantity.toLocaleString("vi-VN")}) vượt quá tồn hiện có của giàn ${fromShelf.code} (${totalAvailable.toLocaleString("vi-VN")})`
    );
  }

  const draws: { lot: (typeof sourceLots)[number]; take: number }[] = [];
  let remaining = quantity;
  for (const lot of sourceLots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.quantity);
    draws.push({ lot, take });
    remaining -= take;
  }

  const lockedDraw = draws.find((d) => d.lot.instructionItems.length > 0);
  if (lockedDraw) {
    const instructionCodes = Array.from(new Set(lockedDraw.lot.instructionItems.map((i) => i.instruction.code)));
    throw new ShelfAssignError(
      `Lô ${lockedDraw.lot.code} trên giàn ${fromShelf.code} đang là nguồn của chỉ định cấy ${instructionCodes.join(", ")} — chưa thể bàn giao đi kho khác cho tới khi chỉ định đó được bàn giao/hủy.`
    );
  }

  const plantTypeCode = sourceLots[0].plantType.code;

  const transfer = await prisma.$transaction(async (tx) => {
    for (const { lot, take } of draws) {
      await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: take }, initialQuantity: { decrement: take } } });
    }

    return tx.transfer.create({
      data: {
        code: await generateTransferCode(tx),
        fromWarehouseId: workplaceWarehouseId,
        fromRoomId: fromShelf.roomId,
        toWarehouseId,
        toRoomId: null,
        fromUserId,
        toUserId: null,
        status: "PENDING",
        notes: notes ? `${MOTHER_WAREHOUSE_TRANSFER_TAG}|${notes}` : MOTHER_WAREHOUSE_TRANSFER_TAG,
        items: { create: draws.map((d) => ({ lotId: d.lot.id, quantity: d.take })) },
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
        title: "Có phiếu bàn giao mẫu mẹ liên kho chờ nhận",
        message: `${fromWarehouse?.name ?? "Kho khác"} đã gửi phiếu ${transfer.code} — ${quantity.toLocaleString("vi-VN")} cụm ${plantTypeCode} (${stageCode}), chờ xác nhận số lượng thực nhận`,
        userId: u.id,
        relatedId: transfer.id,
        relatedType: "Transfer",
      })
    )
  );

  return { transferCode: transfer.code, fromShelfCode: fromShelf.code, toWarehouseName: toWarehouse.name, quantity };
}

export async function confirmMotherStockReceipt(params: {
  transferId: string;
  toShelfCode?: string;
  actualQuantity: number;
  workplaceWarehouseId: string;
  confirmedByUserId: string;
}): Promise<{ createdLotCode: string | null; shortfall: number; sentQuantity: number }> {
  const { transferId, toShelfCode, actualQuantity, workplaceWarehouseId, confirmedByUserId } = params;

  if (actualQuantity < 0) throw new ShelfAssignError("Số lượng thực nhận không được âm");

  const confirmedByUser = await prisma.user.findUnique({ where: { id: confirmedByUserId }, select: { code: true } });
  const confirmedByCode = confirmedByUser?.code ?? confirmedByUserId.slice(0, 6);

  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId, notes: { startsWith: MOTHER_WAREHOUSE_TRANSFER_TAG }, toWarehouseId: workplaceWarehouseId, status: "PENDING" },
    include: {
      fromUser: { select: { id: true, name: true } },
      fromWarehouse: { select: { name: true } },
      items: { include: { lot: { select: { plantTypeId: true, stageCode: true, plantType: { select: { code: true, name: true } } } } } },
    },
  });
  if (!transfer) throw new ShelfAssignError("Không tìm thấy phiếu bàn giao mẫu mẹ liên kho đang chờ xác nhận");

  const sentQuantity = transfer.items.reduce((s, i) => s + i.quantity, 0);
  if (actualQuantity > sentQuantity) {
    throw new ShelfAssignError(`Số lượng thực nhận (${actualQuantity.toLocaleString("vi-VN")}) không được vượt quá số đã gửi (${sentQuantity.toLocaleString("vi-VN")})`);
  }

  const first = transfer.items[0].lot;
  const plantTypeId = first.plantTypeId;
  const plantTypeCode = first.plantType.code;
  const plantTypeName = first.plantType.name;
  const stageCode = first.stageCode;

  let toShelf: { id: string; code: string; capacity: number | null; assignedStaffId: string | null; plantTypeId: string | null; allowedCodes: string[]; lots: { quantity: number }[] } | null = null;
  if (actualQuantity > 0) {
    if (!toShelfCode) throw new ShelfAssignError("Cần chọn giàn đích khi số lượng thực nhận lớn hơn 0");
    toShelf = await prisma.shelf.findFirst({
      where: { code: toShelfCode.trim().toUpperCase(), warehouseId: workplaceWarehouseId, isActive: true, room: { type: "PHONG_MAU_ME" } },
      select: {
        id: true,
        code: true,
        capacity: true,
        assignedStaffId: true,
        plantTypeId: true,
        allowedCodes: true,
        lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
      },
    });
    if (!toShelf) {
      throw new ShelfAssignError(`Không tìm thấy giàn Phòng mẫu mẹ đang hoạt động thuộc kho này với mã: ${toShelfCode}`);
    }
    if (toShelf.assignedStaffId) {
      if (toShelf.plantTypeId !== plantTypeId) {
        throw new ShelfAssignError(`Giàn ${toShelf.code} đã gán riêng cho 1 NV và chỉ nhận đúng 1 mã cây — không khớp mã cây ${plantTypeCode}`);
      }
    } else if (toShelf.allowedCodes.length > 0 && !matchesAllowedCodes(toShelf.allowedCodes, plantTypeCode)) {
      throw new ShelfAssignError(`Giàn ${toShelf.code} không cho phép xếp mã cây ${plantTypeCode} — Cho phép xếp: ${toShelf.allowedCodes.join(", ")}`);
    }
    if (toShelf.capacity !== null) {
      const capLeft = toShelf.capacity - toShelf.lots.reduce((s, l) => s + l.quantity, 0);
      if (actualQuantity > capLeft) {
        throw new ShelfAssignError(`Giàn ${toShelf.code} không đủ chỗ — còn trống ${Math.max(0, capLeft).toLocaleString("vi-VN")} cụm, cần xếp ${actualQuantity.toLocaleString("vi-VN")} cụm`);
      }
    }
  }

  let createdLotCode: string | null = null;
  await prisma.$transaction(async (tx) => {
    if (actualQuantity > 0 && toShelf) {
      const code = await generateLotCode({ plantTypeCode, staffCode: confirmedByCode, stageCode, client: tx });
      await tx.lot.create({
        data: {
          code,
          plantTypeId,
          stage: "MAU_ME",
          stageCode,
          shelfId: toShelf.id,
          quantity: actualQuantity,
          initialQuantity: actualQuantity,
          status: "ACTIVE",
          enteredAt: new Date(),
        },
      });
      createdLotCode = code;
    }

    await tx.transferItem.updateMany({ where: { transferId: transfer.id }, data: { confirmedAt: new Date() } });
    await tx.transfer.update({ where: { id: transfer.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  });

  const shortfall = sentQuantity - actualQuantity;
  if (shortfall > 0) {
    const message = `Phiếu ${transfer.code}: ${transfer.fromWarehouse?.name ?? "kho nguồn"} gửi ${sentQuantity.toLocaleString("vi-VN")} cụm ${plantTypeCode} (${stageCode}) — kho đích chỉ nhận thực tế ${actualQuantity.toLocaleString("vi-VN")} cụm, thiếu ${shortfall.toLocaleString("vi-VN")} cụm (${plantTypeName})`;
    await createAlert({
      type: "MOTHER_WAREHOUSE_TRANSFER_SHORTFALL",
      title: "Nhận thiếu mẫu mẹ bàn giao liên kho",
      message,
      userId: transfer.fromUser.id,
      relatedId: transfer.id,
      relatedType: "Transfer",
    });
    for (const targetRole of ["ADMIN", "SUPER_ADMIN"] as const) {
      await createAlert({
        type: "MOTHER_WAREHOUSE_TRANSFER_SHORTFALL",
        title: "Nhận thiếu mẫu mẹ bàn giao liên kho",
        message,
        targetRole,
        relatedId: transfer.id,
        relatedType: "Transfer",
      });
    }
  }

  return { createdLotCode, shortfall, sentQuantity };
}
