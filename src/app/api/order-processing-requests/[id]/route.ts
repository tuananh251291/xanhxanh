import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateLotCode } from "@/lib/codes";
import { z } from "zod";

const patchSchema = z.object({ action: z.literal("complete") });

// "Hoàn thành" 1 Yêu cầu xử lý đơn hàng — Kho thành phẩm xác nhận đã mở nguyên túi cho đơn hàng liên
// quan. Đây là điểm trừ tồn thực đầu tiên cho dòng này: trừ sourceLot theo deductQuantity (nguyên túi
// đã mở), rồi cộng phần dư (surplusQuantity) trở lại kho khả dụng dưới dạng quy cách T01 (rời) — cộng
// dồn vào lô ACTIVE cùng loại cây trong phòng đó nếu đã có, không thì tạo lô mới (đúng pattern merge-
// hoặc-tạo-mới đã dùng ở POST /api/processing-tickets). Phần neededQuantity (đã trừ khỏi sourceLot
// nhưng không cộng vào lô nào) coi như đã tách riêng chờ xuất kho cho đúng đơn này.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const [request, completingUser] = await Promise.all([
    prisma.orderProcessingRequest.findUnique({
      where: { id },
      include: { plantType: { select: { code: true } }, sourceLot: { select: { quantity: true } } },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } }),
  ]);
  if (!request) return NextResponse.json({ message: "Không tìm thấy yêu cầu xử lý" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ message: "Yêu cầu này đã được xử lý" }, { status: 400 });
  }
  if (request.sourceLot.quantity < request.deductQuantity) {
    return NextResponse.json(
      { message: `Lô ${request.sourceStageCode} không đủ để mở nguyên túi — kiểm tra lại tồn kho trước khi hoàn thành` },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.lot.update({ where: { id: request.sourceLotId }, data: { quantity: { decrement: request.deductQuantity } } });

    const existingLot = await tx.lot.findFirst({
      where: { roomId: request.roomId, plantTypeId: request.plantTypeId, stageCode: "T01", status: "ACTIVE" },
      orderBy: { enteredAt: "asc" },
    });

    if (existingLot) {
      await tx.lot.update({ where: { id: existingLot.id }, data: { quantity: { increment: request.surplusQuantity } } });
    } else {
      const code = await generateLotCode({
        plantTypeCode: request.plantType.code,
        staffCode: completingUser?.code ?? "000",
        stageCode: "T01",
      });
      await tx.lot.create({
        data: {
          code,
          plantTypeId: request.plantTypeId,
          stage: "THANH_PHAM",
          stageCode: "T01",
          roomId: request.roomId,
          quantity: request.surplusQuantity,
          initialQuantity: request.surplusQuantity,
          status: "ACTIVE",
        },
      });
    }

    await tx.orderProcessingRequest.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date(), completedById: session.user.id },
    });
  });

  return NextResponse.json({ success: true });
}
