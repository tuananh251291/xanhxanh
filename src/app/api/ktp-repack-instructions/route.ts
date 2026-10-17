import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { FINISHED_SPEC_LABELS } from "@/types";
import { generateRepackInstructionCode } from "@/lib/codes";
import { getProcessingRoom, getAvailableInProcessingRoom, InsufficientRoomStockError } from "@/lib/finished-goods";
import { z } from "zod";

const OUTPUT_STAGE_CODES = Object.keys(FINISHED_SPEC_LABELS) as [keyof typeof FINISHED_SPEC_LABELS, ...(keyof typeof FINISHED_SPEC_LABELS)[]];

const schema = z.object({
  // Mỗi dòng = 1 Phiếu xử lý (cùng mã cây + quy cách có thể nhiều dòng).
  lines: z
    .array(z.object({
      plantTypeId: z.string().min(1),
      stageCode: z.string().min(1),
      quantity: z.number().int().positive(),
      outputStageCode: z.enum(OUTPUT_STAGE_CODES),
    }))
    .min(1, "Chưa có dòng nào"),
  productionWarehouseId: z.string().min(1, "Chưa chọn khu sản xuất"),
  notes: z.string().trim().max(500).optional(),
});

// "Tạo phiếu xử lý" của Quản lý kho thành phẩm — mục menu riêng, tạo bất cứ lúc nào (trước đây là 1 trong
// 3 việc tuần QLK_DE_XUAT_TUAN slot "qlk-xu-ly", đã bỏ khỏi việc tuần). Mỗi dòng → 1 RepackInstruction có
// ktpRoomId (Phòng chờ xử lý) + productionWarehouseId, status KTP_WAITING_HANDOVER — không cần duyệt, CHƯA
// trừ Phòng chờ xử lý (chỉ giữ chỗ): Kho thành phẩm vào "Bàn giao liên kho" bấm Bàn giao mới trừ, Kho mô
// khu sản xuất nhận vào Phòng đợi xử lý, xử lý xong bàn giao liên kho lại Kho thành phẩm.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm mới tạo được phiếu xử lý" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán kho làm việc" }, { status: 400 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { lines, productionWarehouseId, notes } = parsed.data;

  const processingRoom = await getProcessingRoom(warehouseId);
  if (!processingRoom) return NextResponse.json({ message: "Kho chưa có Phòng chờ xử lý — liên hệ Admin" }, { status: 400 });

  const productionWarehouse = await prisma.warehouse.findFirst({
    where: { id: productionWarehouseId, type: "SAN_XUAT", isActive: true },
    select: { id: true, code: true, name: true },
  });
  if (!productionWarehouse) return NextResponse.json({ message: "Khu sản xuất không hợp lệ" }, { status: 400 });

  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.plantTypeId))] } },
    select: { id: true, code: true },
  });
  const ptById = new Map(plantTypes.map((p) => [p.id, p]));
  if (lines.some((l) => !ptById.has(l.plantTypeId))) return NextResponse.json({ message: "Mã cây không hợp lệ" }, { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      for (const l of lines) {
        const pt = ptById.get(l.plantTypeId)!;
        // Đọc lại trong transaction — các dòng trước vừa tạo cũng đã giữ chỗ nên tính luôn vào phần đã giữ.
        const available = await getAvailableInProcessingRoom(tx, processingRoom.id, l.plantTypeId, l.stageCode);
        if (available < l.quantity) {
          throw new InsufficientRoomStockError(`Phiếu xử lý ${pt.code} ${l.stageCode}: chỉ còn ${available.toLocaleString("vi-VN")} cây chưa giữ chỗ`);
        }
        const code = await generateRepackInstructionCode({ warehouseCode: productionWarehouse.code, shelfCode: "TP", client: tx });
        await tx.repackInstruction.create({
          data: {
            code, plantTypeId: l.plantTypeId, ktpRoomId: processingRoom.id, productionWarehouseId: productionWarehouse.id,
            inputStageCode: l.stageCode, inputQuantity: l.quantity, outputStageCode: l.outputStageCode,
            expectedOutputQuantity: l.quantity, createdById: session.user.id, notes, status: "KTP_WAITING_HANDOVER",
          },
          select: { id: true },
        });
      }
    }, { timeout: 30000 });
  } catch (err) {
    if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
    throw err;
  }

  return NextResponse.json({ success: true, count: lines.length }, { status: 201 });
}
