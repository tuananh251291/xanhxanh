import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { createAlert } from "@/lib/inventory";
import { upsertLot } from "@/lib/goods-receipt";
import { generateContaminationProposalCode } from "@/lib/codes";
import { getProcessingRoom, deductFromRoomFifo, getAvailableInProcessingRoom, InsufficientRoomStockError } from "@/lib/finished-goods";
import { qlkSlotOf } from "@/lib/daily-task-weekly";
import { z } from "zod";

const lineSchema = z.object({ plantTypeId: z.string().min(1), stageCode: z.string().min(1), quantity: z.number().int().min(0) });

const schema = z.object({
  // Việc Đề xuất hủy: số hủy Quản lý chốt cho từng nhóm mã cây + quy cách đang chờ gộp — nhóm không gửi lên
  // coi như giữ nguyên tổng NV đề xuất. Phần giảm bớt (tổng NV − số chốt) cộng vào Phòng chờ xử lý.
  destroy: z.array(lineSchema).default([]),
  // Việc Đề xuất trồng.
  plant: z.array(lineSchema).default([]),
  productionGardenId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

// Quản lý kho thành phẩm gửi 1 trong 2 việc tuần (QLK_DE_XUAT_TUAN, slotKey xem QLK_WEEKLY_SLOTS) — mỗi việc
// chỉ nhận đúng phần của nó, 1 transaction:
// - qlk-huy: gộp mọi FinishedGoodsCheckLine chưa gộp (tồn đã trừ lúc NV gửi phiếu) → 1 phiếu HUY/nhóm,
//   roomId = Phòng chờ xử lý (Admin cấp cao từ chối thì hoàn về đó); phần Quản lý giảm cộng Phòng chờ xử lý.
// - qlk-trong: trừ Phòng chờ xử lý, tạo phiếu TRONG gửi Admin cấp cao — duyệt thì tự tạo phiếu bàn giao về
//   Vườn (xem PATCH /api/contamination-proposals/[id]).
// (Phiếu xử lý trước đây là việc tuần thứ 3 — đã tách thành mục menu riêng, xem POST /api/ktp-repack-instructions.)
// Việc này + các việc cùng loại của tuần trước còn PENDING đều chuyển COMPLETED. Gửi không có dòng nào
// vẫn được (tuần đó không có gì cần làm).
export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || (role !== "QUAN_LY_KHO_THANH_PHAM" && !isAdminRole(role))) {
    return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm mới gửi được" }, { status: 403 });
  }
  const { taskId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  const task = await prisma.dailyTask.findUnique({
    where: { id: taskId },
    select: { id: true, code: true, title: true, type: true, status: true, warehouseId: true, slotKey: true },
  });
  if (!task || task.type !== "QLK_DE_XUAT_TUAN" || !task.warehouseId) return NextResponse.json({ message: "Không tìm thấy nhiệm vụ" }, { status: 404 });
  if (task.status !== "PENDING") return NextResponse.json({ message: "Nhiệm vụ đã được gửi" }, { status: 400 });
  if (role === "QUAN_LY_KHO_THANH_PHAM" && task.warehouseId !== session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Nhiệm vụ không thuộc kho bạn làm việc" }, { status: 403 });
  }
  const warehouseId = task.warehouseId;
  const slot = qlkSlotOf(task.slotKey);
  // Việc cùng loại của các tuần trước ("manager" = việc gộp kiểu cũ, tính là việc hủy).
  const sameSlotKeys = slot === "qlk-huy" ? ["qlk-huy", "manager"] : [slot];

  const plantLines = slot === "qlk-trong" ? data.plant.filter((l) => l.quantity > 0) : [];

  const processingRoom = await getProcessingRoom(warehouseId);
  if (!processingRoom) return NextResponse.json({ message: "Kho chưa có Phòng chờ xử lý — liên hệ Admin" }, { status: 400 });

  if (plantLines.length > 0) {
    if (!data.productionGardenId) return NextResponse.json({ message: "Chưa chọn Vườn sản xuất cho Đề xuất trồng" }, { status: 400 });
    const garden = await prisma.productionGarden.findUnique({ where: { id: data.productionGardenId }, select: { isActive: true } });
    if (!garden?.isActive) return NextResponse.json({ message: "Vườn sản xuất không hợp lệ" }, { status: 400 });
  }

  const pendingLines = slot === "qlk-huy"
    ? await prisma.finishedGoodsCheckLine.findMany({
        where: { warehouseId, destroyConsumedAt: null, destroyQuantity: { gt: 0 } },
        select: { id: true, plantTypeId: true, stageCode: true, destroyQuantity: true },
      })
    : [];
  const destroyTotals = new Map<string, number>();
  for (const l of pendingLines) {
    const key = `${l.plantTypeId}:${l.stageCode}`;
    destroyTotals.set(key, (destroyTotals.get(key) ?? 0) + l.destroyQuantity);
  }
  const destroyChosen = new Map<string, number>();
  if (slot === "qlk-huy") {
    for (const d of data.destroy) {
      const key = `${d.plantTypeId}:${d.stageCode}`;
      const total = destroyTotals.get(key);
      if (total == null) return NextResponse.json({ message: "Có dòng hủy không còn chờ gộp — tải lại trang" }, { status: 409 });
      if (d.quantity > total) return NextResponse.json({ message: "Số hủy chốt không được lớn hơn tổng NV đề xuất" }, { status: 400 });
      destroyChosen.set(key, d.quantity);
    }
  }

  const plantTypeIds = [...new Set([...destroyTotals.keys()].map((k) => k.split(":")[0]).concat(plantLines.map((l) => l.plantTypeId)))];
  const plantTypes = await prisma.plantType.findMany({ where: { id: { in: plantTypeIds } }, select: { id: true, code: true, name: true } });
  const ptById = new Map(plantTypes.map((p) => [p.id, p]));
  if (plantLines.some((l) => !ptById.has(l.plantTypeId))) {
    return NextResponse.json({ message: "Mã cây không hợp lệ" }, { status: 400 });
  }
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } });
  const staffCode = me?.code ?? "000";

  let created = { huy: 0, trong: 0 };
  try {
    created = await prisma.$transaction(async (tx) => {
      const locked = await tx.dailyTask.updateMany({ where: { id: task.id, status: "PENDING" }, data: { status: "COMPLETED", completedAt: new Date(), resultNotes: data.notes } });
      if (locked.count === 0) throw new InsufficientRoomStockError("Nhiệm vụ đã được gửi");
      // Việc cùng loại của các tuần trước lỡ hạn còn PENDING cũng coi như đã xử lý.
      await tx.dailyTask.updateMany({
        where: { type: "QLK_DE_XUAT_TUAN", warehouseId, status: "PENDING", slotKey: { in: sameSlotKeys }, id: { not: task.id } },
        data: { status: "COMPLETED", completedAt: new Date(), resultNotes: `Gộp vào ${task.code}` },
      });

      const now = new Date();
      let huy = 0;
      if (pendingLines.length > 0) {
        await tx.finishedGoodsCheckLine.updateMany({
          where: { id: { in: pendingLines.map((l) => l.id) } },
          data: { destroyConsumedAt: now, destroyConsumedTaskId: task.id },
        });
        let huyBatch: string | null = null;
        for (const key of destroyTotals.keys()) {
          const [plantTypeId, stageCode] = key.split(":");
          const total = destroyTotals.get(key)!;
          const chosen = destroyChosen.get(key) ?? total;
          const pt = ptById.get(plantTypeId)!;
          if (total - chosen > 0) {
            await upsertLot(tx, processingRoom.id, plantTypeId, pt.code, stageCode, total - chosen, staffCode);
          }
          if (chosen > 0) {
            const code = await generateContaminationProposalCode("HUY", now, tx);
            huyBatch = huyBatch ?? code;
            await tx.contaminationProposal.create({
              data: {
                code, batchCode: huyBatch, type: "HUY", warehouseId, roomId: processingRoom.id, dailyTaskId: task.id,
                plantTypeId, stageCode, quantity: chosen, notes: data.notes, requestedById: session.user.id,
              },
            });
            huy += 1;
          }
        }
      }

      let trong = 0;
      let trongBatch: string | null = null;
      for (const l of plantLines) {
        const pt = ptById.get(l.plantTypeId)!;
        const availablePlant = await getAvailableInProcessingRoom(tx, processingRoom.id, l.plantTypeId, l.stageCode);
        if (availablePlant < l.quantity) {
          throw new InsufficientRoomStockError(`Đề xuất trồng ${pt.code} ${l.stageCode}: chỉ còn ${availablePlant.toLocaleString("vi-VN")} cây (đã trừ phần giữ chỗ cho Phiếu xử lý chưa bàn giao)`);
        }
        await deductFromRoomFifo(tx, processingRoom.id, l.plantTypeId, l.stageCode, l.quantity, `Đề xuất trồng ${pt.code} ${l.stageCode}`);
        const code = await generateContaminationProposalCode("TRONG", now, tx);
        trongBatch = trongBatch ?? code;
        await tx.contaminationProposal.create({
          data: {
            code, batchCode: trongBatch, type: "TRONG", warehouseId, roomId: processingRoom.id, dailyTaskId: task.id,
            productionGardenId: data.productionGardenId, plantTypeId: l.plantTypeId, stageCode: l.stageCode,
            quantity: l.quantity, notes: data.notes, requestedById: session.user.id,
          },
        });
        trong += 1;
      }

      return { huy, trong };
    }, { timeout: 30000 });
  } catch (err) {
    if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
    throw err;
  }

  if (created.huy + created.trong > 0) {
    await createAlert({
      type: "CONTAMINATION_PROPOSAL",
      title: `Có ${created.huy > 0 ? "đề xuất Hủy" : "đề xuất Trồng"} mới từ Kho thành phẩm`,
      message: `${session.user.name} gửi "${task.title ?? task.code}": ${created.huy > 0 ? `${created.huy} dòng hủy` : `${created.trong} dòng trồng`} — chờ Admin cấp cao duyệt.`,
      targetRole: "SUPER_ADMIN",
      relatedId: task.id,
      relatedType: "DailyTask",
    });
  }

  return NextResponse.json({ success: true, ...created }, { status: 201 });
}
