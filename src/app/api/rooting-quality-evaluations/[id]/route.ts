import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { generateLotCode } from "@/lib/codes";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { notifyRootingQualityEvaluationReady } from "@/lib/rooting-quality-evaluation";
import { z } from "zod";

// Chi tiết 1 đánh giá — kèm danh sách (mã cây, quy cách) TƯƠI của Nhóm tuần ra rễ tại thời điểm gọi
// (không dùng dữ liệu lúc tạo nhiệm vụ, có thể đã đổi nếu sản xuất mới phát sinh giữa tuần) — dùng cho
// màn hình NV Kỹ thuật nhập "Số đạt".
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const evaluation = await prisma.rootingQualityEvaluation.findUnique({
    where: { id },
    select: {
      id: true, code: true, status: true, weekStart: true, reason: true, completedAt: true,
      warehouseId: true, roomId: true, rotationGroupId: true, assignedToId: true,
      warehouse: { select: { name: true } },
      room: { select: { name: true } },
      rotationGroup: { select: { name: true, rotationOrder: true } },
      assignedTo: { select: { name: true, code: true } },
      items: {
        select: { plantTypeId: true, stageCode: true, totalQuantity: true, passedQuantity: true, failedQuantity: true, plantType: { select: { code: true, name: true } } },
      },
    },
  });
  if (!evaluation) return NextResponse.json({ message: "Không tìm thấy đánh giá" }, { status: 404 });

  const isOwner = evaluation.assignedToId === session.user.id;
  const isSameWarehouseKhoMo = session.user.role === "KHO_MO" && session.user.workplaceWarehouseId === evaluation.warehouseId;
  if (!isOwner && !isSameWarehouseKhoMo && !isAdminRole(session.user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  // Dòng "tổng tồn" TƯƠI — chỉ cần khi đánh giá còn PENDING (đã COMPLETED thì dùng snapshot ở `items`).
  let currentRows: { plantTypeId: string; stageCode: string; totalQuantity: number; plantTypeCode: string; plantTypeName: string }[] = [];
  if (evaluation.status === "PENDING") {
    const lots = await prisma.lot.findMany({
      where: { status: "ACTIVE", shelf: { rotationGroupId: evaluation.rotationGroupId, roomId: evaluation.roomId } },
      select: { quantity: true, plantTypeId: true, stageCode: true, plantType: { select: { code: true, name: true } } },
    });
    const map = new Map<string, { plantTypeId: string; stageCode: string; totalQuantity: number; plantTypeCode: string; plantTypeName: string }>();
    for (const lot of lots) {
      const key = `${lot.plantTypeId}::${lot.stageCode}`;
      const row = map.get(key) ?? { plantTypeId: lot.plantTypeId, stageCode: lot.stageCode, totalQuantity: 0, plantTypeCode: lot.plantType.code, plantTypeName: lot.plantType.name };
      row.totalQuantity += lot.quantity;
      map.set(key, row);
    }
    currentRows = Array.from(map.values()).sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode) || a.stageCode.localeCompare(b.stageCode));
  }

  return NextResponse.json({ ...evaluation, currentRows });
}

const patchSchema = z.object({
  items: z.array(z.object({
    plantTypeId: z.string(),
    stageCode: z.string(),
    passedQuantity: z.number().int().min(0),
  })),
  reason: z.string().trim().min(1, "Cần nhập lý do giải thích tỉ lệ đạt/không đạt"),
});

// Hoàn thành đánh giá — tách/di dời VẬT LÝ phần "không đạt" sang kệ Nhóm tuần ra rễ KẾ TIẾP ngay trong 1
// transaction, để Kho mô sau đó chỉ còn thấy đúng phần đã đạt trên kệ khi bàn giao (không cần sửa
// POST /api/transfers hay 2 luồng "gửi cả kho"/"gửi từng phần" hiện có).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const evaluation = await prisma.rootingQualityEvaluation.findUnique({
    where: { id },
    select: { id: true, code: true, warehouseId: true, roomId: true, rotationGroupId: true, status: true, assignedToId: true },
  });
  if (!evaluation) return NextResponse.json({ message: "Không tìm thấy đánh giá" }, { status: 404 });
  if (evaluation.assignedToId !== session.user.id && !isAdminRole(session.user.role)) {
    return NextResponse.json({ message: "Bạn không được giao đánh giá này" }, { status: 403 });
  }
  if (evaluation.status !== "PENDING") {
    return NextResponse.json({ message: "Đánh giá này đã được hoàn thành" }, { status: 400 });
  }

  // Chặn nếu Nhóm này đang có phiếu bàn giao PENDING chờ Kho thành phẩm xác nhận — lô cũ vẫn còn nằm
  // vật lý trên kệ cho tới khi xác nhận xong (cùng lý do hasPendingHandover chặn XẾP THÊM lô mới vào
  // Nhóm này, xem src/lib/shelf-assignment.ts), tránh tách/di dời nhầm lô mà phiếu đó đang phụ thuộc.
  const pendingItem = await prisma.transferItem.findFirst({
    where: {
      transfer: { status: "PENDING", fromWarehouseId: evaluation.warehouseId, fromRoom: { type: "PHONG_RA_RE" } },
      lot: { shelf: { rotationGroupId: evaluation.rotationGroupId } },
    },
    select: { id: true },
  });
  if (pendingItem) {
    return NextResponse.json(
      { message: "Nhóm tuần này đang có phiếu bàn giao chờ Kho thành phẩm xác nhận — chưa thể đánh giá cho tới khi được xác nhận" },
      { status: 409 }
    );
  }

  const currentGroup = await prisma.shelfGroup.findUnique({ where: { id: evaluation.rotationGroupId }, select: { rotationOrder: true } });
  if (!currentGroup || currentGroup.rotationOrder === null) {
    return NextResponse.json({ message: "Nhóm tuần ra rễ này chưa có thứ tự xoay vòng — SUPER_ADMIN cần cấu hình ở /settings/shelf-groups" }, { status: 400 });
  }
  const raReGroups = await prisma.shelfGroup.findMany({ where: { rotationKind: "RA_RE" }, select: { id: true, rotationOrder: true } });
  const totalSlots = raReGroups.length;
  const nextOrder = currentGroup.rotationOrder === totalSlots ? 1 : currentGroup.rotationOrder + 1;
  const nextGroup = raReGroups.find((g) => g.rotationOrder === nextOrder);
  if (!nextGroup) {
    return NextResponse.json({ message: "Chưa xác định được Nhóm tuần ra rễ kế tiếp — SUPER_ADMIN cần cấu hình ở /settings/shelf-groups" }, { status: 400 });
  }

  const destShelves = await prisma.shelf.findMany({
    where: { warehouseId: evaluation.warehouseId, isActive: true, room: { type: "PHONG_RA_RE" }, rotationGroupId: nextGroup.id },
    select: { id: true, code: true, capacity: true, lots: { where: { status: "ACTIVE" }, select: { quantity: true } } },
  });

  const lots = await prisma.lot.findMany({
    where: { status: "ACTIVE", shelf: { rotationGroupId: evaluation.rotationGroupId, roomId: evaluation.roomId } },
    select: { id: true, code: true, quantity: true, stageCode: true, enteredAt: true, plantTypeId: true, instructionId: true, plantType: { select: { code: true } } },
  });

  type Row = { plantTypeId: string; stageCode: string; total: number };
  const rowsMap = new Map<string, Row>();
  for (const lot of lots) {
    const key = `${lot.plantTypeId}::${lot.stageCode}`;
    const row = rowsMap.get(key) ?? { plantTypeId: lot.plantTypeId, stageCode: lot.stageCode, total: 0 };
    row.total += lot.quantity;
    rowsMap.set(key, row);
  }

  const staffUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const localUsed = new Map(destShelves.map((s) => [s.id, s.lots.reduce((sum, l) => sum + l.quantity, 0)]));
      const pickDestShelf = (amount: number) => {
        const candidates = destShelves
          .map((s) => ({ s, capLeft: (s.capacity ?? Infinity) - (localUsed.get(s.id) ?? 0) }))
          .filter((c) => c.capLeft >= amount)
          .sort((a, b) => b.capLeft - a.capLeft);
        return candidates[0]?.s ?? null;
      };

      const itemsToCreate: { plantTypeId: string; stageCode: string; totalQuantity: number; passedQuantity: number; failedQuantity: number }[] = [];
      let evalTotal = 0;
      let evalPassed = 0;

      for (const [key, row] of rowsMap) {
        const submitted = parsed.data.items.find((i) => `${i.plantTypeId}::${i.stageCode}` === key);
        // Dòng client không gửi (VD sản xuất mới phát sinh giữa lúc tải trang và lúc gửi) mặc định coi là
        // đạt hết — không âm thầm đẩy sang "không đạt" cho phần NV Kỹ thuật chưa kịp xem qua.
        const passedQuantity = submitted ? Math.max(0, Math.min(submitted.passedQuantity, row.total)) : row.total;
        const failedQuantity = row.total - passedQuantity;
        itemsToCreate.push({ plantTypeId: row.plantTypeId, stageCode: row.stageCode, totalQuantity: row.total, passedQuantity, failedQuantity });
        evalTotal += row.total;
        evalPassed += passedQuantity;
        if (failedQuantity <= 0) continue;

        // FIFO: lô CŨ nhất tính đạt trước (giữ nguyên tại chỗ, khớp đúng thứ tự sẽ được ưu tiên bàn giao
        // thật ở luồng gửi hiện có) — phần không đạt rơi vào lô MỚI hơn.
        let remainingPassed = passedQuantity;
        const rowLots = lots
          .filter((l) => `${l.plantTypeId}::${l.stageCode}` === key)
          .sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());

        for (const lot of rowLots) {
          if (remainingPassed >= lot.quantity) {
            remainingPassed -= lot.quantity;
            continue;
          }
          if (remainingPassed <= 0) {
            const dest = pickDestShelf(lot.quantity);
            if (!dest) throw new ShelfAssignError(`Không đủ chỗ ở Nhóm tuần ra rễ kế tiếp cho lô ${lot.code}`);
            await tx.lot.update({ where: { id: lot.id }, data: { shelfId: dest.id, enteredAt: new Date() } });
            localUsed.set(dest.id, (localUsed.get(dest.id) ?? 0) + lot.quantity);
            continue;
          }
          const failedAmount = lot.quantity - remainingPassed;
          const dest = pickDestShelf(failedAmount);
          if (!dest) throw new ShelfAssignError(`Không đủ chỗ ở Nhóm tuần ra rễ kế tiếp cho phần không đạt của lô ${lot.code}`);
          await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: failedAmount } } });
          const code = await generateLotCode({ plantTypeCode: lot.plantType.code, staffCode: staffUser?.code ?? "000", stageCode: lot.stageCode, client: tx });
          await tx.lot.create({
            data: {
              code, plantTypeId: lot.plantTypeId, stage: "THANH_PHAM", stageCode: lot.stageCode,
              shelfId: dest.id, quantity: failedAmount, initialQuantity: failedAmount, status: "ACTIVE",
              enteredAt: new Date(), instructionId: lot.instructionId, parentLotId: lot.id,
            },
          });
          localUsed.set(dest.id, (localUsed.get(dest.id) ?? 0) + failedAmount);
          remainingPassed = 0;
        }
      }

      if (itemsToCreate.length > 0) {
        await tx.rootingQualityEvaluationItem.createMany({
          data: itemsToCreate.map((r) => ({ evaluationId: id, ...r })),
        });
      }
      await tx.rootingQualityEvaluation.update({
        where: { id },
        data: { status: "COMPLETED", reason: parsed.data.reason, completedAt: new Date() },
      });

      return { evalTotal, evalPassed };
    });

    await notifyRootingQualityEvaluationReady({
      warehouseId: evaluation.warehouseId,
      code: evaluation.code,
      totalQuantity: result.evalTotal,
      passedQuantity: result.evalPassed,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ShelfAssignError) {
      return NextResponse.json({ message: err.message }, { status: 400 });
    }
    throw err;
  }
}
