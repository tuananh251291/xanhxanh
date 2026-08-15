import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SURPLUS_TRANSFER_TAG } from "@/types";
import { z } from "zod";

const schema = z.object({
  transferIds: z.array(z.string()).min(1, "Cần ít nhất 1 phiếu"),
});

// Kho mô "Hoàn lại" 1 hoặc nhiều phiếu bàn giao Phòng tối CHƯA xử lý gì cả (chưa xếp kệ, và chưa kiểm tra
// luồng Đỏ HOẶC đã bấm kiểm tra nhưng chưa thực nhập gì — xem isTrivialInspection bên dưới) — dùng khi NV
// cấy mô bàn giao nhầm/muốn rút lại, hoặc Kho mô lỡ bấm "Xác nhận kiểm tra xong" nhầm phiếu mà chưa kịp
// nhập số liệu thật. Xoá phiếu (Transfer + TransferItem, và TransferInspection rỗng nếu có) — VÀ trả lô
// gốc về đúng trạng thái TRƯỚC lúc NV cấy mô bấm "Kiểm tra" (Lot.inspectedAt/inspectedById = null, hoàn
// lại đúng số nhiễm đã trừ + trừ lại khỏi Phòng nhiễm nếu lần kiểm tra đó có báo nhiễm — xem
// revertLotSelfCheck bên dưới), để NV cấy mô kiểm tra lại được từ đầu trên /dashboard-basic/kiem-tra-nhiem.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { transferIds } = parsed.data;

  const transfers = await prisma.transfer.findMany({
    where: { id: { in: transferIds } },
    include: {
      fromRoom: { select: { type: true, warehouseId: true, warehouse: { select: { code: true } } } },
      items: {
        select: {
          id: true, confirmedAt: true,
          lot: { select: { id: true, code: true, stageCode: true, inspectedAt: true, plantType: { select: { code: true } } } },
        },
      },
      inspection: {
        select: {
          id: true,
          items: { select: { contaminatedQuantity: true, unqualifiedQuantity: true, randomCheckPassRate: true } },
        },
      },
    },
  });

  if (transfers.length !== transferIds.length) {
    return NextResponse.json({ message: "Không tìm thấy một số phiếu bàn giao" }, { status: 404 });
  }

  // Chặn cứng — chỉ hoàn lại được phiếu CHƯA bị động tới ở bất kỳ đâu: đúng kho mình phụ trách, đang
  // PENDING, chưa có dòng nào được xác nhận xếp kệ (confirmedAt). Riêng bước kiểm tra (luồng Đỏ) vẫn cho
  // hoàn lại NẾU phiếu kiểm tra chưa thực sự ghi nhận gì — mọi dòng còn nguyên giá trị mặc định lúc mở
  // form (contaminatedQuantity=0, unqualifiedQuantity=0, randomCheckPassRate=0%, xem inspect-form.tsx) —
  // nghĩa là Kho mô mới bấm "Xác nhận kiểm tra xong" mà chưa thật sự đếm/nhập gì, không có Lot.quantity
  // nào bị trừ, không có bản ghi Phòng nhiễm nào được tạo (xem POST .../inspect bỏ qua item có
  // contaminatedQuantity <= 0) — hoàn lại lúc này an toàn tuyệt đối, không mất dữ liệu kiểm tra thật nào.
  // Chỉ cần MỘT dòng khác mặc định (có nhập số nhiễm/không đạt thật, hoặc đổi tỉ lệ nhiễm) là coi như đã
  // kiểm tra thật — chặn như cũ.
  const isTrivialInspection = (items: { contaminatedQuantity: number; unqualifiedQuantity: number; randomCheckPassRate: number }[]) =>
    items.every((i) => i.contaminatedQuantity === 0 && i.unqualifiedQuantity === 0 && i.randomCheckPassRate === 0);

  for (const t of transfers) {
    if (t.fromRoom?.type !== "PHONG_TOI" || t.fromRoom.warehouseId !== workplaceWarehouseId) {
      return NextResponse.json({ message: `Phiếu ${t.code} không thuộc kho bạn phụ trách` }, { status: 403 });
    }
    if (t.status !== "PENDING" || t.notes === SURPLUS_TRANSFER_TAG) {
      return NextResponse.json({ message: `Phiếu ${t.code} không ở trạng thái có thể hoàn lại` }, { status: 400 });
    }
    if (t.items.some((i) => i.confirmedAt)) {
      return NextResponse.json({ message: `Phiếu ${t.code} đã có lô được xếp kệ — không thể hoàn lại` }, { status: 409 });
    }
    if (t.inspection && !isTrivialInspection(t.inspection.items)) {
      return NextResponse.json({ message: `Phiếu ${t.code} đã được Kho mô kiểm tra và ghi nhận số liệu — không thể hoàn lại` }, { status: 409 });
    }
  }

  const inspectionIds = transfers.map((t) => t.inspection?.id).filter((id): id is string => !!id);

  // Gom các lô cần trả về "chưa kiểm tra" — chỉ lô ĐANG có inspectedAt (đã được NV cấy mô tự kiểm tra),
  // dedupe theo lotId (nhiều phiếu hoàn lại cùng lúc có thể vô tình trùng lô).
  type LotToRevert = { id: string; code: string; stageCode: string; plantTypeCode: string; warehouseId: string; warehouseCode: string };
  const lotsToRevert = new Map<string, LotToRevert>();
  for (const t of transfers) {
    const fromRoom = t.fromRoom!; // đã chặn ở vòng validate trên — chắc chắn PHONG_TOI, có warehouse
    for (const item of t.items) {
      if (item.lot.inspectedAt && !lotsToRevert.has(item.lot.id)) {
        lotsToRevert.set(item.lot.id, {
          id: item.lot.id, code: item.lot.code, stageCode: item.lot.stageCode,
          plantTypeCode: item.lot.plantType.code, warehouseId: fromRoom.warehouseId!, warehouseCode: fromRoom.warehouse!.code,
        });
      }
    }
  }

  const lotIds = [...lotsToRevert.keys()];
  const inspectionItems = lotIds.length > 0 ? await prisma.lotInspectionItem.findMany({ where: { lotId: { in: lotIds } } }) : [];
  const inspectionItemByLotId = new Map(inspectionItems.map((i) => [i.lotId, i]));

  // Trước khi đổi gì — kiểm tra Phòng nhiễm còn đủ số để trừ lại cho MỌI lô có báo nhiễm (gộp theo đúng
  // 1 lô Phòng nhiễm dùng chung, phòng trường hợp nhiều lô trong đợt hoàn lại này cùng mã cây/quy cách).
  // Không đủ (VD đã bị Kho mô gửi đề xuất Trồng/Hủy xử lý mất rồi) — chặn hẳn, không hoàn lại phần nào.
  type PoolNeed = { warehouseId: string; warehouseCode: string; plantTypeCode: string; stageCode: string; amount: number };
  const poolNeeds = new Map<string, PoolNeed>();
  for (const lot of lotsToRevert.values()) {
    const item = inspectionItemByLotId.get(lot.id);
    if (!item || item.contaminatedQuantity <= 0) continue;
    const key = `${lot.warehouseId}|${lot.plantTypeCode}|${lot.stageCode}`;
    const existing = poolNeeds.get(key);
    if (existing) existing.amount += item.contaminatedQuantity;
    else poolNeeds.set(key, { warehouseId: lot.warehouseId, warehouseCode: lot.warehouseCode, plantTypeCode: lot.plantTypeCode, stageCode: lot.stageCode, amount: item.contaminatedQuantity });
  }
  for (const need of poolNeeds.values()) {
    const poolLot = await prisma.lot.findFirst({
      where: { room: { warehouseId: need.warehouseId, type: "PHONG_NHIEM" }, code: `NHIEM-${need.warehouseCode}-${need.plantTypeCode}`, stageCode: need.stageCode },
      select: { quantity: true },
    });
    if (!poolLot || poolLot.quantity < need.amount) {
      return NextResponse.json(
        {
          message: `Phòng nhiễm không còn đủ số lượng để hoàn lại (${need.plantTypeCode} - ${need.stageCode}: cần ${need.amount}, còn ${poolLot?.quantity ?? 0}) — có thể đã được Kho mô gửi đề xuất Trồng/Hủy xử lý rồi`,
        },
        { status: 409 }
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    // Phiếu có kiểm tra "rỗng" (đủ điều kiện hoàn lại ở trên) — xoá luôn cả phiếu kiểm tra trước, tránh
    // vướng ràng buộc khoá ngoại khi xoá Transfer.
    if (inspectionIds.length > 0) {
      await tx.transferInspectionItem.deleteMany({ where: { inspectionId: { in: inspectionIds } } });
      await tx.transferInspection.deleteMany({ where: { id: { in: inspectionIds } } });
    }
    await tx.transferItem.deleteMany({ where: { transferId: { in: transferIds } } });
    await tx.transfer.deleteMany({ where: { id: { in: transferIds } } });

    // Trả từng lô về đúng trạng thái TRƯỚC lúc NV cấy mô bấm "Kiểm tra" (xem comment đầu file).
    for (const lot of lotsToRevert.values()) {
      const item = inspectionItemByLotId.get(lot.id);
      if (item) {
        if (item.contaminatedQuantity > 0) {
          // Hoàn lại đúng số đã trừ lúc kiểm tra, và trừ lại khỏi Phòng nhiễm (đã xác nhận đủ ở trên).
          await tx.lot.update({ where: { id: lot.id }, data: { quantity: { increment: item.contaminatedQuantity } } });

          const poolLot = await tx.lot.findFirst({
            where: { room: { warehouseId: lot.warehouseId, type: "PHONG_NHIEM" }, code: `NHIEM-${lot.warehouseCode}-${lot.plantTypeCode}`, stageCode: lot.stageCode },
            select: { id: true },
          });
          if (poolLot) {
            await tx.lot.update({
              where: { id: poolLot.id },
              data: { quantity: { decrement: item.contaminatedQuantity }, initialQuantity: { decrement: item.contaminatedQuantity } },
            });
            await tx.contaminationRoomEntry.create({
              data: {
                contaminationLotId: poolLot.id,
                quantity: -item.contaminatedQuantity,
                sourceLotId: lot.id,
                sourceLotCode: lot.code,
                reportedById: session.user.id,
                reason: "DARK_ROOM_SELF_CHECK_UNDONE",
              },
            });
          }
        }

        // Xoá dòng kiểm tra của đúng lô này — GIỮ nguyên LotInspection nếu còn dòng khác (1 phiếu kiểm
        // tra có thể gộp nhiều quy cách/lô cùng 1 lần nhập số liệu cấy), chỉ xoá cả phiếu nếu rỗng hẳn.
        await tx.lotInspectionItem.delete({ where: { id: item.id } });
        const remaining = await tx.lotInspectionItem.count({ where: { inspectionId: item.inspectionId } });
        if (remaining === 0) {
          await tx.lotInspection.delete({ where: { id: item.inspectionId } });
        } else {
          const agg = await tx.lotInspectionItem.aggregate({
            where: { inspectionId: item.inspectionId },
            _sum: { initialQuantity: true, contaminatedQuantity: true, passedQuantity: true },
          });
          await tx.lotInspection.update({
            where: { id: item.inspectionId },
            data: {
              totalQuantity: agg._sum.initialQuantity ?? 0,
              contaminatedQuantity: agg._sum.contaminatedQuantity ?? 0,
              passedQuantity: agg._sum.passedQuantity ?? 0,
            },
          });
        }
      }

      await tx.lot.update({ where: { id: lot.id }, data: { inspectedAt: null, inspectedById: null } });
    }
  });

  return NextResponse.json({ success: true });
}
