import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import { createAlert } from "@/lib/inventory";
import { upsertLot } from "@/lib/goods-receipt";
import { WEEKLY_CHECK_ROOM_TYPES, getProcessingRoom, deductFromRoomFifo, InsufficientRoomStockError } from "@/lib/finished-goods";
import { z } from "zod";

const schema = z.object({
  dailyTaskId: z.string().min(1),
  roomId: z.string().min(1),
  lines: z
    .array(
      z.object({
        plantTypeId: z.string().min(1),
        stageCode: z.string().min(1),
        destroyQuantity: z.number().int().min(0),
        toProcessingQuantity: z.number().int().min(0),
      })
    ),
});

// NV Kho thành phẩm gửi phiếu "Kiểm tra kho cây theo tuần" (DailyTask DE_XUAT_TRONG_HUY) — KHÔNG gửi Admin
// nữa mà gửi Quản lý kho thành phẩm (xem FinishedGoodsCheckLine):
// - "Chuyển về Phòng chờ xử lý": chuyển tồn NGAY từ phòng kiểm tra sang Phòng chờ xử lý (NV sắp xếp hàng
//   không đạt về đó luôn).
// - "Đề xuất hủy": trừ NGAY khỏi phòng kiểm tra, chờ Quản lý gộp thành Đề xuất hủy gửi Admin cấp cao
//   (nhiệm vụ tuần QLK_DE_XUAT_TUAN — phần Quản lý giảm bớt sẽ cộng vào Phòng chờ xử lý lúc đó).
// Nhiệm vụ của NV hoàn thành ngay khi gửi phiếu. Đối tác vận hành vẫn dùng luồng cũ
// (POST /api/contamination-proposals), không qua đây.
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !isKhoThanhPhamRole(role)) {
    return NextResponse.json({ message: "Chỉ NV Kho thành phẩm mới gửi được phiếu kiểm tra" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { dailyTaskId, roomId, lines } = parsed.data;

  const activeLines = lines.filter((l) => l.destroyQuantity > 0 || l.toProcessingQuantity > 0);
  // Không nhập dòng nào = kiểm tra xong, không có cây nào hỏng/hủy — vẫn gửi phiếu (rỗng) để hoàn thành nhiệm vụ.
  const keys = new Set(activeLines.map((l) => `${l.plantTypeId}:${l.stageCode}`));
  if (keys.size !== activeLines.length) return NextResponse.json({ message: "Trùng dòng mã cây/quy cách" }, { status: 400 });

  const task = await prisma.dailyTask.findUnique({
    where: { id: dailyTaskId },
    select: { id: true, code: true, title: true, type: true, status: true, assignedToId: true, warehouseId: true },
  });
  const canUseTask =
    task?.type === "DE_XUAT_TRONG_HUY" &&
    task.status === "PENDING" &&
    task.warehouseId === warehouseId &&
    (task.assignedToId === session.user.id || role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(role));
  if (!task || !canUseTask) return NextResponse.json({ message: "Nhiệm vụ không hợp lệ hoặc đã hoàn thành" }, { status: 400 });

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, name: true, warehouseId: true, type: true, isActive: true } });
  if (!room || !room.isActive || room.warehouseId !== warehouseId || !WEEKLY_CHECK_ROOM_TYPES.includes(room.type)) {
    return NextResponse.json({ message: "Phòng không hợp lệ" }, { status: 400 });
  }
  const processingRoom = await getProcessingRoom(warehouseId);
  if (!processingRoom) return NextResponse.json({ message: "Kho chưa có Phòng chờ xử lý — liên hệ Admin" }, { status: 400 });

  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: activeLines.map((l) => l.plantTypeId) } },
    select: { id: true, code: true },
  });
  const plantCodeById = new Map(plantTypes.map((p) => [p.id, p.code]));
  if (plantCodeById.size !== new Set(activeLines.map((l) => l.plantTypeId)).size) {
    return NextResponse.json({ message: "Mã cây không hợp lệ" }, { status: 400 });
  }
  const staff = await prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } });
  const staffCode = staff?.code ?? "000";

  try {
    await prisma.$transaction(async (tx) => {
      // Khoá nhiệm vụ: chỉ 1 lần gửi thành công (2 người bấm cùng lúc thì người sau bị chặn).
      const locked = await tx.dailyTask.updateMany({
        where: { id: task.id, status: "PENDING" },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      if (locked.count === 0) throw new InsufficientRoomStockError("Nhiệm vụ đã được gửi phiếu trước đó");

      for (const l of activeLines) {
        const plantCode = plantCodeById.get(l.plantTypeId)!;
        await deductFromRoomFifo(tx, room.id, l.plantTypeId, l.stageCode, l.destroyQuantity + l.toProcessingQuantity, `${plantCode} ${l.stageCode}`);
        if (l.toProcessingQuantity > 0) {
          await upsertLot(tx, processingRoom.id, l.plantTypeId, plantCode, l.stageCode, l.toProcessingQuantity, staffCode);
        }
        await tx.finishedGoodsCheckLine.create({
          data: {
            dailyTaskId: task.id,
            warehouseId,
            sourceRoomId: room.id,
            plantTypeId: l.plantTypeId,
            stageCode: l.stageCode,
            destroyQuantity: l.destroyQuantity,
            toProcessingQuantity: l.toProcessingQuantity,
            createdById: session.user.id,
          },
        });
      }
    }, { timeout: 30000 });
  } catch (err) {
    if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
    throw err;
  }

  const totalDestroy = activeLines.reduce((s, l) => s + l.destroyQuantity, 0);
  const totalProcessing = activeLines.reduce((s, l) => s + l.toProcessingQuantity, 0);
  await createAlert({
    type: "FINISHED_GOODS_WEEKLY_CHECK_SUBMITTED",
    title: "Có phiếu kiểm tra kho cây tuần mới",
    message: activeLines.length === 0
      ? `${session.user.name} đã kiểm tra "${task.title ?? task.code}" (${room.name}): không có cây nào hỏng/hủy.`
      : `${session.user.name} gửi phiếu "${task.title ?? task.code}" (${room.name}): đề xuất hủy ${totalDestroy.toLocaleString("vi-VN")} cây, chuyển về Phòng chờ xử lý ${totalProcessing.toLocaleString("vi-VN")} cây.`,
    targetRole: "QUAN_LY_KHO_THANH_PHAM",
    relatedId: task.id,
    relatedType: "DailyTask",
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
