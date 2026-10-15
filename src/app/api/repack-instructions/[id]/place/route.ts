import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { placeRepackOutput, RepackPlacementError } from "@/lib/repack-placement";
import { z } from "zod";

const schema = z.object({ shelfCode: z.string().trim().optional() });

// Kho mô "Sắp xếp" thành phẩm đã xử lý xong quay lại kệ — mặc định gợi ý ĐÚNG kệ nguồn (bỏ trống
// shelfCode), chỉ cần nhập mã kệ khác nếu kệ gốc đã hết chỗ (xem placeRepackOutput).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KHO_MO" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const instruction = await prisma.repackInstruction.findUnique({
    where: { id },
    include: {
      sourceShelf: { select: { code: true, warehouseId: true } },
      plantType: { select: { id: true, code: true, rootingWeeks: true } },
    },
  });
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });
  // Phiếu xử lý Kho thành phẩm không xếp kệ — Kho mô "Bàn giao lại Kho thành phẩm" thay vào đó (xem PATCH
  // /api/repack-instructions/[id] nhánh returnToKtp).
  if (!instruction.sourceShelf || !instruction.sourceShelfId) {
    return NextResponse.json({ message: "Chỉ định chưa có kệ nguồn (Kho mô chưa nhận Phiếu xử lý)" }, { status: 400 });
  }
  const sourceShelf = instruction.sourceShelf;
  const isKtp = !!instruction.ktpRoomId;
  const sourceShelfId = instruction.sourceShelfId;
  if (role === "KHO_MO" && sourceShelf.warehouseId !== session!.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
  }
  if (instruction.status !== "PENDING_PLACEMENT") {
    return NextResponse.json({ message: "Chỉ định không ở trạng thái chờ sắp xếp" }, { status: 400 });
  }
  if (!instruction.khoMoInspectedAt) {
    return NextResponse.json({ message: "Cần kiểm tra kết quả trước khi sắp xếp" }, { status: 400 });
  }

  const staff = await prisma.user.findUnique({ where: { id: session!.user.id }, select: { code: true } });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const { shelf, lot } = await placeRepackOutput(tx, {
        repackInstruction: {
          id: instruction.id,
          sourceShelfId,
          outputStageCode: instruction.outputStageCode,
          confirmedPassedQuantity: instruction.confirmedPassedQuantity,
          confirmedFailedQuantity: instruction.confirmedFailedQuantity,
          plantType: instruction.plantType,
        },
        shelfCode: parsed.data.shelfCode || sourceShelf.code,
        warehouseId: sourceShelf.warehouseId,
        staffCode: staff?.code ?? "000",
        roomType: isKtp ? "PHONG_DOI_XU_LY" : "PHONG_RA_RE",
      });
      return tx.repackInstruction.update({
        where: { id },
        data: {
          placedAt: new Date(),
          placedById: session!.user.id,
          actualOutputShelfId: shelf.id,
          outputLotId: lot.id,
          // Phiếu xử lý Kho thành phẩm: còn bước Kho mô bàn giao liên kho lại Kho thành phẩm.
          status: isKtp ? "WAITING_RETURN_HANDOVER" : "COMPLETED",
        },
      });
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof RepackPlacementError) {
      return NextResponse.json({ message: err.message }, { status: 409 });
    }
    throw err;
  }
}
