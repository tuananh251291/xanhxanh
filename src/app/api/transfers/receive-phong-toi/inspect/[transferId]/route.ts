import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { addToContaminationRoom } from "@/lib/contamination-room";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

async function loadTransfer(transferId: string, workplaceWarehouseId: string) {
  return prisma.transfer.findFirst({
    where: { id: transferId, status: "PENDING", fromRoom: { type: "PHONG_TOI", warehouseId: workplaceWarehouseId } },
    include: {
      fromUser: { select: { code: true, name: true, inspectionLane: true } },
      fromRoom: { select: { warehouseId: true, warehouse: { select: { code: true } } } },
      inspection: { select: { id: true } },
      items: {
        where: { confirmedAt: null },
        select: {
          id: true,
          lotId: true,
          unqualifiedQuantity: true,
          lot: { select: { id: true, code: true, quantity: true, stageCode: true, stage: true, enteredAt: true, plantTypeId: true, plantType: { select: { code: true, name: true } } } },
        },
      },
    },
  });
}

type TransferItem = NonNullable<Awaited<ReturnType<typeof loadTransfer>>>["items"][number];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const { transferId } = await params;
  const transfer = await loadTransfer(transferId, workplaceWarehouseId);
  if (!transfer) return NextResponse.json({ message: "Không tìm thấy phiếu bàn giao" }, { status: 404 });
  if (transfer.fromUser.inspectionLane === "XANH") {
    return NextResponse.json({ message: "NV luồng Xanh không cần kiểm tra ở đây" }, { status: 400 });
  }
  if (transfer.inspection) return NextResponse.json({ message: "Phiếu này đã được kiểm tra" }, { status: 400 });
  if (transfer.items.length === 0) return NextResponse.json({ message: "Phiếu không còn lô nào để kiểm tra" }, { status: 400 });

  // Kết quả kiểm tra chỉ LƯU được gộp theo quy cách (TransferInspectionItem unique theo [inspectionId,
  // stageCode]), nhưng Kho mô NHẬP độc lập theo từng lô (mã cây + quy cách riêng) — xem POST bên dưới
  // gộp lại (cộng dồn số lượng, trung bình tỉ lệ) trước khi lưu. B = số "không đạt" NV cấy mô tự khai
  // lúc bàn giao (TransferItem.unqualifiedQuantity), trả kèm mỗi lô để Kho mô đối chiếu với A (số họ tự
  // kiểm tra nhập ở bước này) — công thức ghi nhận lấy max(A, B), không cộng dồn hay ghi đè lẫn nhau.
  const lots = transfer.items.map((i) => ({
    lotId: i.lot.id,
    lotCode: i.lot.code,
    plantTypeCode: i.lot.plantType.code,
    plantTypeName: i.lot.plantType.name,
    stageCode: i.lot.stageCode,
    quantity: i.lot.quantity,
    enteredAt: i.lot.enteredAt.toISOString(),
    selfReportedUnqualifiedQuantity: i.unqualifiedQuantity,
  }));

  return NextResponse.json({
    transferCode: transfer.code,
    staffCode: transfer.fromUser.code,
    staffName: transfer.fromUser.name,
    lots,
  });
}

const itemSchema = z.object({
  lotId: z.string(),
  contaminatedQuantity: z.number().int().min(0),
  randomCheckPassRate: z.number().min(0).max(100),
  // Số "không đạt" Kho mô TỰ kiểm tra (A) — độc lập với số NV cấy mô tự khai lúc bàn giao (B, xem GET ở
  // trên) — CHỈ áp dụng quy cách thành phẩm (T01/T05), mẫu mẹ (M05) luôn đạt hết nên bắt buộc 0 (validate
  // ở dưới).
  unqualifiedQuantity: z.number().int().min(0),
});
const postSchema = z.object({ items: z.array(itemSchema).min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const { transferId } = await params;
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const transfer = await loadTransfer(transferId, workplaceWarehouseId);
  if (!transfer) return NextResponse.json({ message: "Không tìm thấy phiếu bàn giao" }, { status: 404 });
  if (transfer.fromUser.inspectionLane === "XANH") {
    return NextResponse.json({ message: "NV luồng Xanh không cần kiểm tra ở đây" }, { status: 400 });
  }
  if (transfer.inspection) return NextResponse.json({ message: "Phiếu này đã được kiểm tra" }, { status: 400 });

  const itemByLotId = new Map<string, TransferItem>(transfer.items.map((i) => [i.lotId, i]));
  const expectedLotIds = new Set(itemByLotId.keys());
  const submittedLotIds = new Set(parsed.data.items.map((i) => i.lotId));
  if (expectedLotIds.size !== submittedLotIds.size || [...expectedLotIds].some((id) => !submittedLotIds.has(id))) {
    return NextResponse.json({ message: "Danh sách lô không khớp với phiếu bàn giao" }, { status: 400 });
  }
  for (const item of parsed.data.items) {
    const lot = itemByLotId.get(item.lotId)!.lot;
    if (item.contaminatedQuantity > lot.quantity) {
      return NextResponse.json({ message: `Số nhiễm lô ${lot.code} vượt quá số lượng bàn giao` }, { status: 400 });
    }
    if (lot.stageCode === "M05" && item.unqualifiedQuantity > 0) {
      return NextResponse.json({ message: "Mẫu mẹ (M05) luôn tính đạt hết — không được nhập số không đạt" }, { status: 400 });
    }
    if (item.unqualifiedQuantity > lot.quantity) {
      return NextResponse.json({ message: `Số không đạt lô ${lot.code} vượt quá số lượng bàn giao` }, { status: 400 });
    }
  }

  // Gộp input theo từng lô về đúng 1 bản ghi/quy cách (ràng buộc DB, xem TransferItem ở trên) — số lượng
  // (nhiễm/A) cộng dồn, tỉ lệ đạt lấy trung bình CỘNG đơn giản giữa các lô cùng quy cách (không theo
  // trọng số số lượng). Riêng SL ghi nhận tính RIÊNG cho từng lô rồi cộng dồn — không tính lại từ tỉ lệ
  // trung bình đã gộp — để khớp đúng công thức áp cho từng lô, không lệch do gộp trước rồi mới tính.
  const groups = new Map<
    string,
    { handedOverQuantity: number; contaminatedQuantity: number; unqualifiedQuantity: number; rateSum: number; rateCount: number; creditedQuantity: number }
  >();
  for (const item of parsed.data.items) {
    const transferItem = itemByLotId.get(item.lotId)!;
    const lot = transferItem.lot;
    const group = groups.get(lot.stageCode) ?? {
      handedOverQuantity: 0, contaminatedQuantity: 0, unqualifiedQuantity: 0, rateSum: 0, rateCount: 0, creditedQuantity: 0,
    };
    group.handedOverQuantity += lot.quantity;
    group.contaminatedQuantity += item.contaminatedQuantity;
    group.unqualifiedQuantity += item.unqualifiedQuantity;
    group.rateSum += item.randomCheckPassRate;
    group.rateCount += 1;
    // SL NV cấy mô được ghi nhận = (SL bàn giao - max(A, B)) x tỉ lệ đạt kiểm tra ngẫu nhiên, tính riêng
    // theo từng lô (A = Kho mô tự kiểm tra, B = NV cấy mô tự khai lúc bàn giao — TransferItem.unqualifiedQuantity).
    group.creditedQuantity += Math.max(
      0,
      Math.round((lot.quantity - Math.max(item.unqualifiedQuantity, transferItem.unqualifiedQuantity)) * (item.randomCheckPassRate / 100))
    );
    groups.set(lot.stageCode, group);
  }

  const warehouseId = transfer.fromRoom!.warehouseId;
  const warehouseCode = transfer.fromRoom!.warehouse.code;

  await prisma.$transaction(async (tx) => {
    await tx.transferInspection.create({
      data: {
        transferId,
        inspectedById: session.user.id,
        items: {
          create: [...groups.entries()].map(([stageCode, g]) => ({
            stageCode,
            handedOverQuantity: g.handedOverQuantity,
            contaminatedQuantity: g.contaminatedQuantity,
            passedQuantity: g.handedOverQuantity - g.contaminatedQuantity,
            randomCheckPassRate: g.rateSum / g.rateCount,
            unqualifiedQuantity: g.unqualifiedQuantity,
            creditedQuantity: g.creditedQuantity,
          })),
        },
      },
    });

    // Trừ nhiễm đúng theo từng LÔ Kho mô đã nhập — input đã sẵn theo từng lô nên không cần dồn tuần tự
    // qua nhiều lô cùng quy cách như cách làm cũ (khi input còn gộp theo quy cách).
    for (const item of parsed.data.items) {
      if (item.contaminatedQuantity <= 0) continue;
      const lot = itemByLotId.get(item.lotId)!.lot;
      await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: item.contaminatedQuantity } } });
      await addToContaminationRoom(tx, {
        warehouseId,
        warehouseCode,
        plantTypeId: lot.plantTypeId,
        plantTypeCode: lot.plantType.code,
        stage: lot.stage,
        stageCode: lot.stageCode,
        quantity: item.contaminatedQuantity,
      });
    }
  });

  // Báo cho đúng NV cấy mô đã gửi phiếu này biết kết quả kiểm tra (số lượng ghi nhận) đã có — xem
  // trang /handover-record. Chỉ luồng Đỏ/chưa cài đặt luồng mới tới được route này (luồng Xanh bị
  // chặn ở trên), nên không cần kiểm tra lại inspectionLane ở đây. Transaction phía trên đã commit
  // xong (kiểm tra + trừ hàng nhiễm đã lưu thật) — lỗi gửi thông báo ở đây KHÔNG được để làm hỏng
  // response, nếu không Kho mô sẽ tưởng cả thao tác kiểm tra thất bại dù dữ liệu đã lưu.
  try {
    await createAlert({
      type: "INSPECTION_RESULT_READY",
      title: "Có kết quả kiểm tra bàn giao",
      message: `Phiếu ${transfer.code} đã được Kho mô kiểm tra xong — xem số lượng được ghi nhận`,
      userId: transfer.fromUserId,
      relatedId: transfer.id,
      relatedType: "Transfer",
    });
  } catch (err) {
    console.error(`[inspect/${transferId}] Không gửi được thông báo INSPECTION_RESULT_READY:`, err);
  }

  return NextResponse.json({ success: true });
}
