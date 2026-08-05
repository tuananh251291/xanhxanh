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
  if (role === "KHO_MO" && instruction.sourceShelf.warehouseId !== session!.user.workplaceWarehouseId) {
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
          sourceShelfId: instruction.sourceShelfId,
          outputStageCode: instruction.outputStageCode,
          confirmedPassedQuantity: instruction.confirmedPassedQuantity,
          confirmedFailedQuantity: instruction.confirmedFailedQuantity,
          plantType: instruction.plantType,
        },
        shelfCode: parsed.data.shelfCode || instruction.sourceShelf.code,
        warehouseId: instruction.sourceShelf.warehouseId,
        staffCode: staff?.code ?? "000",
      });
      return tx.repackInstruction.update({
        where: { id },
        data: {
          placedAt: new Date(),
          placedById: session!.user.id,
          actualOutputShelfId: shelf.id,
          outputLotId: lot.id,
          status: "COMPLETED",
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
