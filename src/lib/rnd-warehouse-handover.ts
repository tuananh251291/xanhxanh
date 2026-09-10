import { prisma } from "@/lib/prisma";
import { generateLotCode, generateTransferCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { RND_OUTPUT_TRANSFER_TAG } from "@/types";
import { ShelfAssignError, matchesAllowedCodes } from "@/lib/shelf-assignment";
import { getOrCreateRndWarehouse, getOrCreateRndInputShelf, getOrCreateRndOutputShelf } from "@/lib/rnd-instruction-warehouse";

// Bàn giao SẢN PHẨM R&D sang 1 kho THẬT khác trong hệ thống — CẢ khu sản xuất (SAN_XUAT) lẫn kho thành
// phẩm (THANH_PHAM) — mô phỏng src/lib/mother-warehouse-transfer.ts (tag riêng trong notes + hàng đợi/
// xác nhận riêng, KHÔNG qua receive-phong-toi/do-lane vì pipeline đó hard-code giả định "phòng nguồn
// cùng kho với người xem", sẽ không hiện phiếu liên kho cho đúng người nhận). Admin kỹ thuật KHÔNG chọn
// từ lô có sẵn — tự khai thẳng mã cây/quy cách/số lượng đang có trong tay rồi bàn giao ngay, hệ thống tự
// tạo 1 Lot mới trên kệ ẩn của "Kho SX R&D" (getOrCreateRndInputShelf cho M05, getOrCreateRndOutputShelf
// cho T05/T01) rồi bàn giao lô đó đi luôn — không cần đã tồn tại trong Phòng tối cá nhân/qua bước nhập
// dữ liệu cấy trước.
export async function sendRndOutputToWarehouse(params: {
  plantTypeId: string;
  stageCode: "M05" | "T05" | "T01";
  quantity: number;
  toWarehouseId: string;
  fromUserId: string;
  notes?: string;
}): Promise<{ transferCode: string; toWarehouseName: string; totalQuantity: number }> {
  const { plantTypeId, stageCode, quantity, toWarehouseId, fromUserId, notes } = params;
  if (quantity <= 0) throw new ShelfAssignError("Số lượng bàn giao phải lớn hơn 0");

  const plantType = await prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { code: true } });
  if (!plantType) throw new ShelfAssignError("Không tìm thấy mã cây");

  const stage = stageCode === "M05" ? "MAU_ME" : "THANH_PHAM";

  const toWarehouse = await prisma.warehouse.findFirst({
    where: { id: toWarehouseId, isActive: true, isRnd: false, type: { in: ["SAN_XUAT", "THANH_PHAM"] } },
    select: { id: true, name: true, type: true },
  });
  if (!toWarehouse) throw new ShelfAssignError("Không tìm thấy kho đích đang hoạt động");
  // Kho thành phẩm không quản lý mẫu mẹ — chỉ nhận được thành phẩm (T05/T01).
  if (toWarehouse.type === "THANH_PHAM" && stage !== "THANH_PHAM") {
    throw new ShelfAssignError("Kho thành phẩm chỉ nhận được lô thành phẩm — mẫu mẹ cần bàn giao sang 1 khu sản xuất khác");
  }

  const [staff, rndWarehouse] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: fromUserId }, select: { code: true } }),
    getOrCreateRndWarehouse(),
  ]);
  const bucketShelf = stage === "MAU_ME"
    ? await getOrCreateRndInputShelf(rndWarehouse.id)
    : await getOrCreateRndOutputShelf(rndWarehouse.id);

  const lotCode = await generateLotCode({ plantTypeCode: plantType.code, staffCode: staff.code, stageCode });

  const transfer = await prisma.$transaction(async (tx) => {
    const lot = await tx.lot.create({
      data: {
        code: lotCode,
        plantTypeId,
        stage,
        stageCode,
        shelfId: bucketShelf.id,
        quantity: 0,
        initialQuantity: quantity,
        status: "PLANTED",
        enteredAt: new Date(),
      },
    });
    return tx.transfer.create({
      data: {
        code: await generateTransferCode(tx),
        fromWarehouseId: rndWarehouse.id,
        fromRoomId: bucketShelf.roomId,
        toWarehouseId,
        toRoomId: null,
        fromUserId,
        toUserId: null,
        status: "PENDING",
        notes: notes ? `${RND_OUTPUT_TRANSFER_TAG}|${notes}` : RND_OUTPUT_TRANSFER_TAG,
        items: { create: [{ lotId: lot.id, quantity }] },
      },
    });
  });

  const destRole = toWarehouse.type === "SAN_XUAT" ? "KHO_MO" : "KHO_THANH_PHAM";
  const destStaff = await prisma.user.findMany({
    where: { role: destRole, workplaceWarehouseId: toWarehouseId, isActive: true },
    select: { id: true },
  });
  await Promise.all(
    destStaff.map((u) =>
      createAlert({
        type: "LOT_READY_TRANSFER",
        title: "Có phiếu bàn giao từ R&D chờ nhận",
        message: `Kho SX R&D đã gửi phiếu ${transfer.code} — ${quantity.toLocaleString("vi-VN")} cụm, chờ xác nhận nhập kho`,
        userId: u.id,
        relatedId: transfer.id,
        relatedType: "Transfer",
      })
    )
  );

  return { transferCode: transfer.code, toWarehouseName: toWarehouse.name, totalQuantity: quantity };
}

// toLocationCode = mã giàn kệ (kho đích là khu sản xuất — Phòng mẫu mẹ/ra rễ tuỳ stage) HOẶC mã phòng
// (kho đích là kho thành phẩm — không quản lý theo giàn kệ, lô gắn thẳng vào Phòng) — xác định theo
// đúng Warehouse.type của kho đích, không cần người gọi tự phân biệt trước.
export async function confirmRndOutputReceipt(params: {
  transferId: string;
  toLocationCode: string;
  workplaceWarehouseId: string;
  confirmedByUserId: string;
}): Promise<{ createdLotCodes: string[] }> {
  const { transferId, toLocationCode, workplaceWarehouseId, confirmedByUserId } = params;

  const confirmedByUser = await prisma.user.findUnique({ where: { id: confirmedByUserId }, select: { code: true } });
  const confirmedByCode = confirmedByUser?.code ?? confirmedByUserId.slice(0, 6);

  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId, notes: { startsWith: RND_OUTPUT_TRANSFER_TAG }, toWarehouseId: workplaceWarehouseId, status: "PENDING" },
    include: {
      toWarehouse: { select: { type: true } },
      items: {
        include: { lot: { select: { plantTypeId: true, stage: true, stageCode: true, plantType: { select: { code: true } } } } },
      },
    },
  });
  if (!transfer) throw new ShelfAssignError("Không tìm thấy phiếu bàn giao R&D đang chờ xác nhận");
  if (transfer.items.length === 0) throw new ShelfAssignError("Phiếu không có lô nào");

  const stage = transfer.items[0].lot.stage;
  const totalIncoming = transfer.items.reduce((s, i) => s + i.quantity, 0);
  const locationCode = toLocationCode.trim().toUpperCase();

  let shelfId: string | null = null;
  let roomId: string | null = null;

  if (transfer.toWarehouse.type === "SAN_XUAT") {
    const roomType = stage === "MAU_ME" ? "PHONG_MAU_ME" : "PHONG_RA_RE";
    const toShelf = await prisma.shelf.findFirst({
      where: { code: locationCode, warehouseId: workplaceWarehouseId, isActive: true, room: { type: roomType } },
      select: {
        id: true, code: true, capacity: true, assignedStaffId: true, plantTypeId: true, allowedCodes: true,
        lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
      },
    });
    if (!toShelf) {
      throw new ShelfAssignError(
        `Không tìm thấy giàn ${roomType === "PHONG_MAU_ME" ? "Phòng mẫu mẹ" : "Phòng ra rễ"} đang hoạt động thuộc kho này với mã: ${toLocationCode}`
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
    if (toShelf.capacity !== null) {
      const capLeft = toShelf.capacity - toShelf.lots.reduce((s, l) => s + l.quantity, 0);
      if (totalIncoming > capLeft) {
        throw new ShelfAssignError(`Giàn ${toShelf.code} không đủ chỗ — còn trống ${Math.max(0, capLeft).toLocaleString("vi-VN")}, cần xếp ${totalIncoming.toLocaleString("vi-VN")}`);
      }
    }
    shelfId = toShelf.id;
  } else {
    // Kho thành phẩm — không quản lý theo giàn kệ, Admin/Kho thành phẩm chọn thẳng 1 Phòng của kho mình
    // (Phòng đạt tiêu chuẩn/theo dõi/hàn túi) để nhận lô R&D.
    const toRoom = await prisma.room.findFirst({
      where: { code: locationCode, warehouseId: workplaceWarehouseId, isActive: true, type: { in: ["PHONG_DAT_TIEU_CHUAN", "PHONG_THEO_DOI", "PHONG_HAN_TUI"] } },
      select: { id: true, code: true },
    });
    if (!toRoom) throw new ShelfAssignError(`Không tìm thấy phòng đang hoạt động thuộc kho này với mã: ${toLocationCode}`);
    roomId = toRoom.id;
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
          shelfId,
          roomId,
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
