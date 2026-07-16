import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateOrderProcessingRequestCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { FINISHED_SPEC_BAG_SIZE } from "@/types";
import { z } from "zod";

const patchSchema = z.object({ action: z.enum(["confirm", "ship", "cancel"]) });

// "Xác nhận đơn hàng" — Sale bấm khi khách đã đồng ý mua, chuyển HELD -> CONFIRMED, một chiều. Đây là
// lúc DUY NHẤT phát sinh "Yêu cầu xử lý cây" (nếu 1 dòng cần trừ tồn thật không tròn quy cách túi) và
// báo cho Kho thành phẩm — trước khi xác nhận, Kho thành phẩm chưa biết/chưa cần biết gì về đơn này.
// KHÔNG trừ tồn thực ở bước này (tồn thực chỉ đổi khi Kho thành phẩm "Hoàn thành xử lý" và "Xuất kho").
async function confirmOrder(orderId: string, user: { id: string; role: string | null }) {
  if (user.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được chức năng này" }, { status: 403 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { lot: { select: { id: true, stageCode: true, roomId: true, plantTypeId: true } } } } },
  });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (order.saleId !== user.id) {
    return NextResponse.json({ message: "Chỉ được xác nhận đơn hàng của chính mình" }, { status: 403 });
  }
  if (order.status !== "HELD") {
    return NextResponse.json({ message: "Đơn hàng không ở trạng thái Đang giữ — không thể xác nhận" }, { status: 400 });
  }

  let processingRequestCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      // OrderItem.neededQuantity khác null nghĩa là dòng này đã bù túi từ lúc Tạm giữ (xem POST
      // /api/orders) — quantity lúc đó đã là CẢ TÚI tròn sẵn (VD 25), neededQuantity là phần thật cần
      // (VD 21). Không tính lại bagSize/deductQuantity từ quantity như trước (sẽ sai vì quantity giờ
      // luôn là bội số của bagSize) — chỉ cần suy ra bagSize để hiển thị, phần dư = quantity - needed.
      if (item.neededQuantity === null) continue;

      const bagSize = FINISHED_SPEC_BAG_SIZE[item.lot.stageCode as keyof typeof FINISHED_SPEC_BAG_SIZE] ?? 1;
      const code = await generateOrderProcessingRequestCode(tx);
      await tx.orderProcessingRequest.create({
        data: {
          code,
          orderId: order.id,
          orderItemId: item.id,
          roomId: item.lot.roomId!,
          plantTypeId: item.lot.plantTypeId,
          sourceLotId: item.lot.id,
          sourceStageCode: item.lot.stageCode,
          neededQuantity: item.neededQuantity,
          bagSize,
          deductQuantity: item.quantity,
          surplusQuantity: item.quantity - item.neededQuantity,
        },
      });
      processingRequestCount += 1;
    }

    await tx.order.update({ where: { id: order.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  });

  if (processingRequestCount > 0) {
    await createAlert({
      type: "ORDER_PENDING_PACK",
      title: "Có đơn hàng cần tách túi trước khi xuất kho",
      message: `Đơn ${order.code} có ${processingRequestCount} dòng cần tách/ghép túi — xem trang Xử lý cây`,
      targetRole: "KHO_THANH_PHAM",
      relatedId: order.id,
      relatedType: "Order",
    });
  }

  return NextResponse.json({ success: true, processingRequestCount });
}

// "Xóa đơn tạm giữ" — Sale tự huỷ đơn của mình khi còn HELD (VD khách đổi ý trước khi xác nhận), xử lý
// giống hệt đơn hết hạn holdUntil tự động CANCELLED (xem ensureExpiredOrdersCancelled ở
// src/lib/order-lifecycle.ts): chỉ đổi status, KHÔNG đụng tới Lot.quantity — vì mọi phép tính tồn khả
// dụng chỉ trừ đơn đang HELD/CONFIRMED, chuyển sang CANCELLED là tự động "hoàn tồn khả dụng" ngay.
// Đơn HELD chưa từng phát sinh Yêu cầu xử lý cây (chỉ tạo lúc "Xác nhận") nên không cần huỷ theo.
async function cancelOrder(orderId: string, user: { id: string; role: string | null }) {
  if (user.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được chức năng này" }, { status: 403 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, saleId: true, status: true } });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (order.saleId !== user.id) {
    return NextResponse.json({ message: "Chỉ được xóa đơn hàng của chính mình" }, { status: 403 });
  }
  if (order.status !== "HELD") {
    return NextResponse.json({ message: "Đơn hàng không ở trạng thái Đang giữ — không thể xóa" }, { status: 400 });
  }

  await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });

  return NextResponse.json({ success: true });
}

// "Xuất đơn hàng ra khỏi kho" — Kho thành phẩm bấm khi đã đóng gói xong, chuyển CONFIRMED -> SHIPPED,
// một chiều. Đây là điểm trừ tồn thực DUY NHẤT còn lại cho các dòng KHÔNG cần tách túi (dòng đã có Yêu
// cầu xử lý COMPLETED thì tồn thực đã bị trừ ở bước "Hoàn thành xử lý" rồi — xem PATCH
// /api/order-processing-requests/[id], không trừ lại ở đây). Chặn xuất kho nếu còn Yêu cầu xử lý
// PENDING (còn túi chưa mở) — Kho TP phải hoàn thành xử lý trước.
async function shipOrder(orderId: string, user: { id: string; role: string | null }) {
  if (user.role !== "KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          lot: { select: { id: true, stageCode: true, quantity: true } },
          processingRequest: { select: { status: true } },
        },
      },
    },
  });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (order.status !== "CONFIRMED") {
    return NextResponse.json({ message: "Đơn hàng chưa được Sale xác nhận — không thể xuất kho" }, { status: 400 });
  }

  const pendingCount = order.items.filter((i) => i.processingRequest?.status === "PENDING").length;
  if (pendingCount > 0) {
    return NextResponse.json(
      { message: `Còn ${pendingCount} yêu cầu xử lý cây chưa hoàn thành — hoàn thành tại trang Xử lý cây trước khi xuất kho` },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (item.processingRequest) continue; // đã trừ tồn thực ở bước "Hoàn thành xử lý"

        if (item.lot.quantity < item.quantity) {
          throw new Error(`Lô ${item.lot.stageCode} không đủ tồn thực để xuất kho — vui lòng kiểm tra lại tồn kho`);
        }
        await tx.lot.update({ where: { id: item.lot.id }, data: { quantity: { decrement: item.quantity } } });
      }

      await tx.order.update({ where: { id: order.id }, data: { status: "SHIPPED", shippedAt: new Date() } });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  try {
    if (parsed.data.action === "confirm") return await confirmOrder(id, session.user);
    if (parsed.data.action === "cancel") return await cancelOrder(id, session.user);
    return await shipOrder(id, session.user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }
}
