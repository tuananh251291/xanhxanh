import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SURPLUS_TRANSFER_TAG, sumLotQuantity, isAdminRole, isKhoThanhPhamRole } from "@/types";
import { planShelfAssignments, planSurplusPlacement, ShelfAssignError } from "@/lib/shelf-assignment";
import { commitShelfPlacements } from "@/lib/dark-room-shelf-commit";
import { generateLotCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const confirmSchema = z.object({
  action: z.enum(["confirm", "reject", "assign"]),
  shelfAssignments: z.array(z.object({ lotId: z.string(), shelfId: z.string() })).optional(),
  // Nhận thành phẩm từ Phòng ra rễ — chia số lượng theo TỪNG loại cây + quy cách (T01/T05) vào Phòng
  // theo dõi/Phòng hàn túi (không được gộp nhiều loại cây lại rồi chia theo tổng quy cách).
  finishedSplit: z.array(z.object({ roomId: z.string(), plantTypeId: z.string(), stageCode: z.string(), quantity: z.number().int().positive() })).optional(),
  notes: z.string().optional(),
  // action="assign" — Quản lý kho thành phẩm gán đích danh 1 NV kho thành phẩm phụ trách phiếu bàn giao
  // thành phẩm này. null = bỏ gán.
  assignedToId: z.string().nullable().optional(),
});

// Báo cho đúng Quản lý kho thành phẩm đã gán việc — CHỈ gọi khi phiếu thật sự đã được gán (assignedToId
// + assignedById đều có), không phải mọi phiếu (đa số NV kho thành phẩm tự xử lý không qua gán việc).
async function notifyAssignmentCompleted(
  assignedToId: string | null,
  assignedById: string | null,
  relatedId: string,
  relatedType: string,
  message: string
) {
  if (!assignedToId || !assignedById) return;
  await createAlert({
    type: "ASSIGNED_TASK_COMPLETED",
    title: "NV đã hoàn thành việc được giao",
    message,
    userId: assignedById,
    relatedId,
    relatedType,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      fromRoom: { select: { type: true, warehouseId: true } },
      fromUser: { select: { inspectionLane: true } },
      toWarehouse: { select: { type: true } },
      items: {
        include: {
          lot: {
            include: {
              plantType: { select: { code: true, name: true, rootingWeeks: true, transferWaitWeeks: true } },
              instruction: { select: { assignedToId: true, isBackup: true } },
              room: { select: { assignedStaffId: true } },
            },
          },
        },
      },
    },
  });
  if (!transfer) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (transfer.status !== "PENDING") return NextResponse.json({ message: "Phiếu đã xử lý" }, { status: 400 });

  if (parsed.data.action === "assign") {
    if (!isAdminRole(session.user.role) && session.user.role !== "QUAN_LY_KHO_THANH_PHAM") {
      return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm mới gán được việc này" }, { status: 403 });
    }
    if (transfer.toWarehouse?.type !== "THANH_PHAM") {
      return NextResponse.json({ message: "Chỉ gán được cho phiếu bàn giao thành phẩm" }, { status: 400 });
    }
    const { assignedToId } = parsed.data;
    if (assignedToId) {
      const staff = await prisma.user.findUnique({ where: { id: assignedToId }, select: { role: true } });
      if (!staff || !isKhoThanhPhamRole(staff.role)) {
        return NextResponse.json({ message: "Chỉ gán được cho NV kho thành phẩm" }, { status: 400 });
      }
    }
    const updated = await prisma.transfer.update({
      where: { id },
      data: { assignedToId: assignedToId ?? null, assignedById: assignedToId ? session.user.id : null },
      select: { id: true, assignedToId: true, assignedTo: { select: { name: true, code: true } } },
    });
    return NextResponse.json(updated);
  }

  const { action, shelfAssignments, finishedSplit } = parsed.data;

  if (action === "reject") {
    await prisma.transfer.update({ where: { id }, data: { status: "REJECTED" } });
    return NextResponse.json({ success: true });
  }

  // Bàn giao MM dư (chỉ định kết thúc do hết thời gian) — luôn xếp thẳng vào Kho quá hạn, kiểm tra
  // TRƯỚC nhánh Phòng tối vì phiếu này cũng gắn fromRoomId = Phòng tối (để mọi KHO_MO đều thấy).
  const isSurplusTransfer = transfer.notes === SURPLUS_TRANSFER_TAG;

  // Bàn giao từ Phòng tối → Kho sáng: hệ thống tự chỉ định kệ (mẫu mẹ theo đúng NV phụ trách,
  // tràn quá sức chứa kệ (tính theo cụm, do SUPER_ADMIN cài đặt riêng từng kệ) thì dồn sang Kho mẫu
  // mẹ chung; cây ra rễ vào Phòng ra rễ, tính theo cây) — không cần KHO_MO chọn tay.
  if (isSurplusTransfer || transfer.fromRoom?.type === "PHONG_TOI") {
    const warehouseId = transfer.fromRoom?.warehouseId ?? transfer.fromWarehouseId;
    if (!warehouseId) return NextResponse.json({ message: "Không xác định được kho nguồn" }, { status: 400 });

    // NV không thuộc luồng Xanh (Đỏ/chưa cài đặt) bắt buộc phải qua bước Kiểm tra ở
    // /transfers/receive-phong-toi trước — chốt chặn phòng thủ, luồng UI bình thường không còn
    // đường nào gọi tới đây cho phiếu Đỏ nữa (trang cũ đã lọc, trang mới dùng endpoint riêng).
    if (!isSurplusTransfer && transfer.fromUser.inspectionLane !== "XANH") {
      const inspection = await prisma.transferInspection.findUnique({ where: { transferId: id } });
      if (!inspection) return NextResponse.json({ message: "Cần kiểm tra trước khi xác nhận nhận hàng" }, { status: 400 });
    }

    // Chỉ xử lý phần CHƯA xếp — nếu NV thuộc luồng Xanh, 1 phần (mẫu mẹ hoặc ra rễ) có thể đã được xác
    // nhận riêng qua /transfers/receive-phong-toi trước đó (VD do luồng vừa bị đổi Xanh→Đỏ giữa chừng).
    const pendingItems = transfer.items.filter((i) => !i.confirmedAt);

    let placements;
    try {
      placements = isSurplusTransfer
        ? await planSurplusPlacement(pendingItems.map((i) => ({ lotId: i.lotId, lot: i.lot })), warehouseId)
        : await planShelfAssignments(pendingItems.map((i) => ({ lotId: i.lotId, lot: i.lot })), warehouseId);
    } catch (e) {
      if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 409 });
      throw e;
    }

    await prisma.$transaction(async (tx) => {
      await commitShelfPlacements(tx, placements);
      await tx.transferItem.updateMany({ where: { id: { in: pendingItems.map((i) => i.id) } }, data: { confirmedAt: new Date() } });
      const remaining = await tx.transferItem.count({ where: { transferId: id, confirmedAt: null } });
      if (remaining === 0) {
        await tx.transfer.update({ where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
      }
    });

    return NextResponse.json({
      success: true,
      placements: placements.map((p) => ({
        lotCode: p.lot.code, shelfCode: p.shelfCode, quantity: p.quantity, pool: p.pool,
      })),
    });
  }

  // Bàn giao đến Kho thành phẩm: KHÔNG quản lý theo giàn kệ — lô gắn thẳng vào phòng đích (roomId),
  // không cần chọn kệ.
  if (transfer.toWarehouse?.type === "THANH_PHAM") {
    // Thành phẩm mới nhận từ Phòng ra rễ — KHO_THANH_PHAM tự chia số lượng theo quy cách (T01/T05)
    // vào Phòng theo dõi / Phòng hàn túi (xem finishedSplit). Luân chuyển nội bộ giữa các phòng KTP đã
    // có sẵn 1 phòng đích cụ thể (toRoomId chọn lúc tạo phiếu) nên không cần bước chia này.
    const isExternalFinishedHandoff = transfer.fromRoom?.type === "PHONG_RA_RE";

    if (isExternalFinishedHandoff) {
      if (!finishedSplit || finishedSplit.length === 0) {
        return NextResponse.json({ message: "Cần nhập số lượng phân bổ vào Phòng theo dõi / Phòng hàn túi" }, { status: 400 });
      }

      // Chia riêng theo TỪNG loại cây + quy cách — không được gộp nhiều loại cây lại rồi chia theo tổng
      // quy cách (VD 2 loại cây cùng có T01 phải tách 2 dòng riêng, không cộng chung).
      const groupKey = (plantTypeId: string, stageCode: string) => `${plantTypeId}:${stageCode}`;
      const totalsByGroup = new Map<string, number>();
      for (const item of transfer.items) {
        const key = groupKey(item.lot.plantTypeId, item.lot.stageCode);
        totalsByGroup.set(key, (totalsByGroup.get(key) ?? 0) + item.quantity);
      }
      const splitTotalsByGroup = new Map<string, number>();
      for (const s of finishedSplit) {
        const key = groupKey(s.plantTypeId, s.stageCode);
        splitTotalsByGroup.set(key, (splitTotalsByGroup.get(key) ?? 0) + s.quantity);
      }
      for (const [key, total] of totalsByGroup) {
        if ((splitTotalsByGroup.get(key) ?? 0) !== total) {
          const [, stageCode] = key.split(":");
          const plantTypeName = transfer.items.find((i) => groupKey(i.lot.plantTypeId, i.lot.stageCode) === key)?.lot.plantType.name;
          return NextResponse.json({ message: `Tổng số lượng ${plantTypeName ?? ""} ${stageCode} không khớp với phiếu bàn giao — vui lòng kiểm tra lại` }, { status: 400 });
        }
      }

      await prisma.$transaction(async (tx) => {
        for (const key of totalsByGroup.keys()) {
          const [plantTypeId, stageCode] = key.split(":");
          const groupItems = transfer.items.filter((i) => i.lot.plantTypeId === plantTypeId && i.lot.stageCode === stageCode);
          const buckets = finishedSplit.filter((s) => s.plantTypeId === plantTypeId && s.stageCode === stageCode && s.quantity > 0);

          let itemIdx = 0;
          let itemRemaining = groupItems[0]?.quantity ?? 0;
          const firstAllocDone = new Set<string>();

          for (const bucket of buckets) {
            let need = bucket.quantity;
            while (need > 0 && itemIdx < groupItems.length) {
              const currentItem = groupItems[itemIdx];
              const take = Math.min(need, itemRemaining);

              if (!firstAllocDone.has(currentItem.lotId)) {
                await tx.lot.update({
                  where: { id: currentItem.lotId },
                  data: { roomId: bucket.roomId, shelfId: null, quantity: take, initialQuantity: take, enteredAt: new Date() },
                });
                firstAllocDone.add(currentItem.lotId);
              } else {
                const staffUser = currentItem.lot.instruction?.assignedToId
                  ? await prisma.user.findUnique({ where: { id: currentItem.lot.instruction.assignedToId }, select: { code: true } })
                  : null;
                const code = await generateLotCode({
                  plantTypeCode: currentItem.lot.plantType.code,
                  staffCode: staffUser?.code ?? "000",
                  stageCode: currentItem.lot.stageCode,
                  client: tx,
                });
                await tx.lot.create({
                  data: {
                    code,
                    plantTypeId: currentItem.lot.plantTypeId,
                    stage: currentItem.lot.stage,
                    stageCode: currentItem.lot.stageCode,
                    roomId: bucket.roomId,
                    quantity: take,
                    initialQuantity: take,
                    status: "ACTIVE",
                    enteredAt: new Date(),
                    instructionId: currentItem.lot.instructionId,
                    parentLotId: currentItem.lotId,
                  },
                });
              }

              need -= take;
              itemRemaining -= take;
              if (itemRemaining === 0) {
                itemIdx += 1;
                itemRemaining = groupItems[itemIdx]?.quantity ?? 0;
              }
            }
          }
        }
        await tx.transferItem.updateMany({ where: { transferId: id }, data: { confirmedAt: new Date() } });
        await tx.transfer.update({ where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
      });

      await notifyAssignmentCompleted(
        transfer.assignedToId,
        transfer.assignedById,
        transfer.id,
        "Transfer",
        `Đã xác nhận nhận bàn giao thành phẩm ${transfer.code}`
      );
      return NextResponse.json({ success: true });
    }

    if (!transfer.toRoomId) return NextResponse.json({ message: "Không xác định được phòng đích" }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await tx.lot.update({
          where: { id: item.lotId },
          data: { roomId: transfer.toRoomId, shelfId: null, enteredAt: new Date() },
        });
      }
      await tx.transferItem.updateMany({ where: { transferId: id }, data: { confirmedAt: new Date() } });
      await tx.transfer.update({ where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    });

    await notifyAssignmentCompleted(
      transfer.assignedToId,
      transfer.assignedById,
      transfer.id,
      "Transfer",
      `Đã xác nhận nhận bàn giao thành phẩm ${transfer.code}`
    );
    return NextResponse.json({ success: true });
  }

  // Các loại bàn giao khác: vẫn chọn kệ thủ công như trước.
  const shelfMap = new Map(shelfAssignments?.map((a) => [a.lotId, a.shelfId]) ?? []);

  // Nguyên tắc kệ Phòng mẫu mẹ: 1 kệ chỉ xếp 1 loại cây (nếu đã gán) và không vượt capacity — kiểm tra
  // trước khi cam kết, tính cả các lô khác trong cùng đợt xác nhận này dồn vào cùng 1 kệ. Kệ có thể
  // chứa nhiều lô cùng lúc, giới hạn duy nhất là capacity.
  if (shelfAssignments && shelfAssignments.length > 0) {
    const shelfIds = Array.from(new Set(shelfAssignments.map((a) => a.shelfId)));
    const shelves = await prisma.shelf.findMany({
      where: { id: { in: shelfIds } },
      include: {
        lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } },
        room: { select: { type: true } },
      },
    });
    const shelfById = new Map(shelves.map((s) => [s.id, s]));
    const batchQtyByShelf = new Map<string, number>();

    for (const a of shelfAssignments) {
      const item = transfer.items.find((i) => i.lotId === a.lotId);
      const shelf = shelfById.get(a.shelfId);
      if (!item || !shelf) return NextResponse.json({ message: "Dữ liệu kệ/lô không hợp lệ" }, { status: 400 });
      if (shelf.plantTypeId && shelf.plantTypeId !== item.lot.plantTypeId) {
        return NextResponse.json({ message: `Kệ ${shelf.code} đã gán cho loại cây khác — không thể xếp lô ${item.lot.code}` }, { status: 409 });
      }
      const addUnits = item.lot.quantity;
      batchQtyByShelf.set(a.shelfId, (batchQtyByShelf.get(a.shelfId) ?? 0) + addUnits);
    }

    for (const [shelfId, addQty] of batchQtyByShelf) {
      const shelf = shelfById.get(shelfId)!;
      const existingQty = sumLotQuantity(shelf.lots);
      if (shelf.capacity && existingQty + addQty > shelf.capacity) {
        const unit = shelf.room?.type === "PHONG_MAU_ME" ? "cụm" : "cây";
        return NextResponse.json({ message: `Kệ ${shelf.code} không đủ chỗ (còn trống ${Math.max(0, shelf.capacity - existingQty)}/${shelf.capacity} ${unit})` }, { status: 409 });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      const newShelfId = shelfMap.get(item.lotId);

      // Cập nhật vị trí kệ mới và trạng thái lot
      await tx.lot.update({
        where: { id: item.lotId },
        data: {
          shelfId: newShelfId ?? null,
          enteredAt: new Date(),
        },
      });
    }

    await tx.transferItem.updateMany({ where: { transferId: id }, data: { confirmedAt: new Date() } });
    await tx.transfer.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  });

  return NextResponse.json({ success: true });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const shelfInclude = {
    where: { isActive: true },
    include: {
      plantType: { select: { id: true, code: true, name: true } },
      lots: { where: { status: "ACTIVE" as const }, select: { quantity: true, stageCode: true } },
    },
  };
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      fromWarehouse: true,
      fromRoom: true,
      toWarehouse: { include: { shelves: { ...shelfInclude, where: { ...shelfInclude.where, roomId: null } } } },
      toRoom: { include: { shelves: shelfInclude } },
      fromUser: { select: { name: true } },
      toUser: { select: { name: true } },
      items: {
        include: {
          lot: { include: { plantType: true, shelf: true } },
        },
      },
    },
  });
  if (!transfer) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(transfer);
}
