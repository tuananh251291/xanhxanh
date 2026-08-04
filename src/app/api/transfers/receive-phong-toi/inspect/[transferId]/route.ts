import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { addToContaminationRoom } from "@/lib/contamination-room";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const STAGE_CODES = ["T01", "T05", "M05"] as const;

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

function buildHandedOverByStageCode(items: { lot: { stageCode: string; quantity: number } }[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.lot.stageCode, (map.get(item.lot.stageCode) ?? 0) + item.lot.quantity);
  }
  return map;
}

// Tổng "không đạt" NV cấy mô tự khai lúc bàn giao (xem TransferItem.unqualifiedQuantity), gộp theo quy
// cách — dùng để hiện sẵn (pre-fill) cho Kho mô xác nhận/sửa lại ở bước kiểm tra luồng Đỏ.
function buildUnqualifiedByStageCode(items: { lot: { stageCode: string }; unqualifiedQuantity: number }[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.lot.stageCode, (map.get(item.lot.stageCode) ?? 0) + item.unqualifiedQuantity);
  }
  return map;
}

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

  const handedOverByStageCode = buildHandedOverByStageCode(transfer.items);
  const unqualifiedByStageCode = buildUnqualifiedByStageCode(transfer.items);
  const columns = STAGE_CODES
    .filter((code) => (handedOverByStageCode.get(code) ?? 0) > 0)
    .map((stageCode) => ({
      stageCode,
      handedOverQuantity: handedOverByStageCode.get(stageCode)!,
      // NV cấy mô tự khai lúc bàn giao — hiện sẵn để Kho mô xác nhận/sửa lại (chỉ có ý nghĩa với quy
      // cách thành phẩm T01/T05, luôn 0 với M05).
      selfReportedUnqualifiedQuantity: unqualifiedByStageCode.get(stageCode) ?? 0,
    }));

  // Chi tiết TỪNG lô đang chờ kiểm tra (mã cây/tên cây/ngày nhập kho tối/số lượng riêng) — kết quả kiểm
  // tra (nhiễm/tỉ lệ đạt/không đạt) chỉ lưu được theo QUY CÁCH (TransferInspectionItem unique theo
  // [inspectionId, stageCode], không theo từng lô — 1 phiếu có thể gộp nhiều mã cây cùng quy cách, VD 2
  // mã cây cùng bàn giao T01), nên KHÔNG tách được input theo từng lô — chỉ hiện breakdown RIÊNG (đọc,
  // không nhập) để Kho mô thấy rõ số bàn giao của quy cách đó gồm những lô nào, tránh hiểu nhầm là 1 số
  // gộp mù mờ không biết của mã cây nào/ngày nào.
  const lots = transfer.items.map((i) => ({
    lotId: i.lot.id,
    lotCode: i.lot.code,
    plantTypeCode: i.lot.plantType.code,
    plantTypeName: i.lot.plantType.name,
    stageCode: i.lot.stageCode,
    quantity: i.lot.quantity,
    enteredAt: i.lot.enteredAt.toISOString(),
  }));

  return NextResponse.json({
    transferCode: transfer.code,
    staffCode: transfer.fromUser.code,
    staffName: transfer.fromUser.name,
    lots,
    columns,
  });
}

const itemSchema = z.object({
  stageCode: z.enum(STAGE_CODES),
  contaminatedQuantity: z.number().int().min(0),
  randomCheckPassRate: z.number().min(0).max(100),
  // Kho mô xác nhận/sửa lại số "không đạt" NV cấy mô tự khai — CHỈ áp dụng quy cách thành phẩm (T01/T05),
  // mẫu mẹ (M05) luôn đạt hết nên bắt buộc 0 (validate ở dưới).
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

  const handedOverByStageCode = buildHandedOverByStageCode(transfer.items);
  const expectedStageCodes = new Set([...handedOverByStageCode.keys()]);
  const submittedStageCodes = new Set<string>(parsed.data.items.map((i) => i.stageCode));
  if (expectedStageCodes.size !== submittedStageCodes.size || [...expectedStageCodes].some((c) => !submittedStageCodes.has(c))) {
    return NextResponse.json({ message: "Danh sách quy cách không khớp với phiếu bàn giao" }, { status: 400 });
  }
  for (const item of parsed.data.items) {
    const handedOver = handedOverByStageCode.get(item.stageCode) ?? 0;
    if (item.contaminatedQuantity > handedOver) {
      return NextResponse.json({ message: `Số nhiễm quy cách ${item.stageCode} vượt quá số lượng bàn giao` }, { status: 400 });
    }
    if (item.stageCode === "M05" && item.unqualifiedQuantity > 0) {
      return NextResponse.json({ message: "Mẫu mẹ (M05) luôn tính đạt hết — không được nhập số không đạt" }, { status: 400 });
    }
    if (item.unqualifiedQuantity > handedOver) {
      return NextResponse.json({ message: `Số không đạt quy cách ${item.stageCode} vượt quá số lượng bàn giao` }, { status: 400 });
    }
  }

  const warehouseId = transfer.fromRoom!.warehouseId;
  const warehouseCode = transfer.fromRoom!.warehouse.code;

  await prisma.$transaction(async (tx) => {
    await tx.transferInspection.create({
      data: {
        transferId,
        inspectedById: session.user.id,
        items: {
          create: parsed.data.items.map((item) => {
            const handedOverQuantity = handedOverByStageCode.get(item.stageCode) ?? 0;
            return {
              stageCode: item.stageCode,
              handedOverQuantity,
              contaminatedQuantity: item.contaminatedQuantity,
              passedQuantity: handedOverQuantity - item.contaminatedQuantity,
              randomCheckPassRate: item.randomCheckPassRate,
              unqualifiedQuantity: item.unqualifiedQuantity,
              // Trừ dồn độc lập với nhiễm — 2 lý do loại riêng biệt (VD nhỏ quá vs nhiễm), không gộp
              // chung 1 phép tính. Không âm vì có thể Kho mô nhập "không đạt" lớn hơn phần "đạt" theo
              // tỉ lệ kiểm tra ngẫu nhiên.
              creditedQuantity: Math.max(0, Math.round((item.randomCheckPassRate / 100) * handedOverQuantity) - item.unqualifiedQuantity),
            };
          }),
        },
      },
    });

    for (const item of parsed.data.items) {
      if (item.contaminatedQuantity <= 0) continue;
      // Phân bổ số nhiễm (nhập theo quy cách, gộp cả nhóm) vào các lô thực tế mang đúng quy cách đó
      // trong phiếu — thường chỉ 1 lô, nhưng có thể nhiều lô (VD 2 loại cây cùng quy cách T01). Dồn
      // tuần tự theo mã lô tăng dần, giống mẫu remainingBags/finishedSplit đã dùng nơi khác.
      const lotsForStage = transfer.items
        .map((i) => i.lot)
        .filter((lot) => lot.stageCode === item.stageCode)
        .sort((a, b) => a.code.localeCompare(b.code));

      let remaining = item.contaminatedQuantity;
      for (const lot of lotsForStage) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.quantity);
        if (take <= 0) continue;
        await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
        await addToContaminationRoom(tx, {
          warehouseId,
          warehouseCode,
          plantTypeId: lot.plantTypeId,
          plantTypeCode: lot.plantType.code,
          stage: lot.stage,
          stageCode: lot.stageCode,
          quantity: take,
        });
        remaining -= take;
      }
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
