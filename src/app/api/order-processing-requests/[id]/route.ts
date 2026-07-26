import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { upsertLot } from "@/lib/goods-receipt";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const patchSchema = z.object({
  action: z.literal("complete"),
  actualDeductQuantity: z.number().int().min(0),
  actualOutputQuantity: z.number().int().min(0),
  actualSurplusQuantity: z.number().int().min(0),
});

// "Hoàn thành" 1 Yêu cầu xử lý đơn hàng — Kho thành phẩm nhập SỐ LIỆU THẬT (có thể khác kế hoạch lúc
// giữ đơn) sau khi đã mở túi (nguồn ở Phòng đạt tiêu chuẩn) hoặc chuyển xong từ Kho hàn túi/Theo dõi
// (nguồn ở đó). Đây là điểm trừ tồn thực đầu tiên cho dòng này:
// - sourceLot.quantity trừ đúng actualDeductQuantity (không phải deductQuantity kế hoạch nữa).
// - actualSurplusQuantity (cây dư CHƯA xử lý, còn nguyên quy cách NGUỒN — khác surplusQuantity kế
//   hoạch vốn luôn quy về T01) cộng trở lại 1 lô cùng sourceStageCode tại targetRoomId (Phòng đạt tiêu
//   chuẩn đích nếu nguồn ở Kho hàn túi/Theo dõi, hoặc chính roomId nếu nguồn đã ở Phòng đạt tiêu chuẩn).
// - actualOutputQuantity (số cây thực tế chuyển đổi thành công) KHÔNG tạo lô mới — coi như đã cam kết
//   thẳng cho đơn hàng này (giống quy ước neededQuantity kế hoạch từ trước), chỉ dùng để so sánh với
//   neededQuantity: nếu thấp hơn (thiếu hụt thật) thì báo alert cho đúng Sale sở hữu đơn, không tự ý xử
//   lý gì thêm.
// Phần dự phòng kế hoạch (surplusQuantity, đã giữ trước lúc Tạm giữ đơn) được "hoàn trả" tự động ngay
// khi status chuyển COMPLETED — getQualifiedLots loại các OrderItem có processingRequest COMPLETED khỏi
// tổng trừ HELD-netting, nên không cần thao tác gì thêm cho phần này ở đây.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { actualDeductQuantity, actualOutputQuantity, actualSurplusQuantity } = parsed.data;

  const [request, completingUser] = await Promise.all([
    prisma.orderProcessingRequest.findUnique({
      where: { id },
      include: {
        plantType: { select: { code: true } },
        sourceLot: { select: { quantity: true, status: true, roomId: true } },
        order: { select: { code: true, saleId: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } }),
  ]);
  if (!request) return NextResponse.json({ message: "Không tìm thấy yêu cầu xử lý" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ message: "Yêu cầu này đã được xử lý" }, { status: 400 });
  }
  // Lô "ảo" của 1 Kế hoạch nhập kho chưa về hàng thật — chặn, báo xác nhận kế hoạch trước (trang Nhập hàng).
  if (request.sourceLot.status === "PLANNED") {
    return NextResponse.json(
      { message: `Lô ${request.sourceStageCode} đang chờ hàng dự kiến về thật — xác nhận Kế hoạch nhập kho tại trang Nhập hàng trước khi hoàn thành` },
      { status: 400 }
    );
  }
  if (actualDeductQuantity > request.sourceLot.quantity) {
    return NextResponse.json(
      { message: `Lô ${request.sourceStageCode} chỉ còn ${request.sourceLot.quantity} cây — không đủ để lấy ${actualDeductQuantity} cây` },
      { status: 400 }
    );
  }
  if (actualOutputQuantity + actualSurplusQuantity > actualDeductQuantity) {
    return NextResponse.json(
      { message: "Số lượng thu được cộng số lượng dư không được lớn hơn số lượng thực tế đã lấy" },
      { status: 400 }
    );
  }

  const surplusRoomId = request.targetRoomId ?? request.roomId;

  await prisma.$transaction(async (tx) => {
    await tx.lot.update({ where: { id: request.sourceLotId }, data: { quantity: { decrement: actualDeductQuantity } } });

    if (actualSurplusQuantity > 0) {
      await upsertLot(
        tx, surplusRoomId, request.plantTypeId, request.plantType.code, request.sourceStageCode,
        actualSurplusQuantity, completingUser?.code ?? "000"
      );
    }

    await tx.orderProcessingRequest.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedById: session.user.id,
        actualDeductQuantity,
        actualOutputQuantity,
        actualSurplusQuantity,
      },
    });
  });

  if (actualOutputQuantity < request.neededQuantity) {
    await createAlert({
      type: "ORDER_PROCESSING_SHORTFALL",
      title: "Xử lý cây thiếu hụt so với đơn hàng",
      message: `Yêu cầu ${request.code} (đơn ${request.order.code}): chỉ thu được ${actualOutputQuantity}/${request.neededQuantity} cây cần — kiểm tra lại với khách hàng nếu cần`,
      userId: request.order.saleId,
      relatedId: request.orderId,
      relatedType: "Order",
    });
  }

  return NextResponse.json({ success: true });
}
