import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateOrderProcessingRequestCode, generateProcessingMediumOrderCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { FINISHED_SPEC_BAG_SIZE, isKhoThanhPhamRole, canActAsSale } from "@/types";
import { z } from "zod";

const patchSchema = z.object({
  action: z.enum(["confirm", "ship", "cancel", "assign", "ack"]),
  // action="assign" — Quản lý kho thành phẩm gán đích danh 1 NV kho thành phẩm phụ trách đóng gói/xuất
  // đơn này. null = bỏ gán.
  assignedToId: z.string().nullable().optional(),
});

// Quản lý kho thành phẩm gán đích danh 1 NV kho thành phẩm phụ trách đơn này — chỉ có ý nghĩa với đơn
// đã CONFIRMED (đang chờ xuất, xem trang "Sắp xếp đơn hàng").
async function assignOrder(orderId: string, user: { id: string; role: string | null }, assignedToId: string | null | undefined) {
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && user.role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm mới gán được việc này" }, { status: 403 });
  }
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, assignmentConfirmedAt: true } });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (order.status !== "CONFIRMED") {
    return NextResponse.json({ message: "Chỉ gán được cho đơn đã xác nhận, đang chờ xuất" }, { status: 400 });
  }
  if (order.assignmentConfirmedAt) {
    return NextResponse.json({ message: "NV đã xác nhận nhận việc — không thể đổi người phụ trách khác" }, { status: 400 });
  }
  if (assignedToId) {
    const staff = await prisma.user.findUnique({ where: { id: assignedToId }, select: { role: true } });
    if (!staff || !isKhoThanhPhamRole(staff.role)) {
      return NextResponse.json({ message: "Chỉ gán được cho NV kho thành phẩm" }, { status: 400 });
    }
  }
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { assignedToId: assignedToId ?? null, assignedById: assignedToId ? user.id : null, assignmentConfirmedAt: null },
    select: { id: true, assignedToId: true, assignedTo: { select: { name: true, code: true } }, assignmentConfirmedAt: true },
  });
  return NextResponse.json(updated);
}

// NV được gán bấm "Xác nhận" đã nhận việc — khoá không cho Quản lý đổi assignedToId nữa (xem assignOrder).
async function ackOrder(orderId: string, user: { id: string; role: string | null }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, assignedToId: true, assignmentConfirmedAt: true } });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (order.assignedToId !== user.id) {
    return NextResponse.json({ message: "Bạn không được giao việc này" }, { status: 403 });
  }
  if (order.assignmentConfirmedAt) {
    return NextResponse.json({ message: "Bạn đã xác nhận trước đó" }, { status: 400 });
  }
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { assignmentConfirmedAt: new Date() },
    select: { id: true, assignmentConfirmedAt: true },
  });
  return NextResponse.json(updated);
}

// "Xác nhận đơn hàng" — Sale bấm khi khách đã đồng ý mua, chuyển HELD -> CONFIRMED, một chiều. Đây là
// lúc DUY NHẤT phát sinh "Yêu cầu xử lý cây" (nếu 1 dòng cần trừ tồn thật không tròn quy cách túi) và
// báo cho Kho thành phẩm — trước khi xác nhận, Kho thành phẩm chưa biết/chưa cần biết gì về đơn này.
// KHÔNG trừ tồn thực ở bước này (tồn thực chỉ đổi khi Kho thành phẩm "Hoàn thành xử lý" và "Xuất kho").
async function confirmOrder(orderId: string, user: { id: string; role: string | null }) {
  if (!canActAsSale(user.role)) {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được chức năng này" }, { status: 403 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          lot: {
            select: {
              id: true, stageCode: true, roomId: true, plantTypeId: true,
              room: { select: { type: true, warehouseId: true } },
            },
          },
        },
      },
    },
  });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  // Quản lý kho thành phẩm xác nhận HỘ được mọi đơn (không chỉ đơn saleId trùng chính mình) — vì đơn được
  // tạo hộ luôn gán saleId = NV bán hàng thật (xem POST /api/orders), không phải người quản lý đang bấm.
  if (user.role === "SALE" && order.saleId !== user.id) {
    return NextResponse.json({ message: "Chỉ được xác nhận đơn hàng của chính mình" }, { status: 403 });
  }
  if (order.status !== "HELD") {
    return NextResponse.json({ message: "Đơn hàng không ở trạng thái Đang giữ — không thể xác nhận" }, { status: 400 });
  }

  let processingRequestCount = 0;
  let mediumOrderCount = 0;

  // Môi trường mặc định dùng cho ProcessingMediumOrder (đơn môi trường phát sinh cho đơn xử lý) — luôn
  // là mã "10" (MT CTP Cơ bản, xem prisma/seed.ts). Tra trước transaction vì không đổi theo từng dòng.
  // Thiếu mã này (Admin lỡ xoá ở /medium-types) thì bỏ qua việc tạo đơn môi trường, không chặn xác nhận
  // đơn hàng — đây là tính năng phụ trợ, không phải điều kiện bắt buộc để xác nhận.
  const defaultMediumType = await prisma.mediumType.findUnique({ where: { code: "10" } });

  await prisma.$transaction(async (tx) => {
    // Cache Phòng đạt tiêu chuẩn đích theo kho — nhiều dòng cùng đơn có thể cùng kho, tránh tra lại.
    const targetRoomCache = new Map<string, string | null>();

    for (const item of order.items) {
      // OrderItem.neededQuantity khác null nghĩa là dòng này cần xử lý từ lúc Tạm giữ (xem POST
      // /api/orders) — quantity lúc đó đã là CẢ TÚI tròn sẵn (VD 25), neededQuantity là phần thật cần
      // (VD 21). Không tính lại bagSize/deductQuantity từ quantity như trước (sẽ sai vì quantity giờ
      // luôn là bội số của bagSize) — chỉ cần suy ra bagSize để hiển thị, phần dư = quantity - needed.
      if (item.neededQuantity === null) continue;

      // Nguồn ở Kho hàn túi/Theo dõi (không phải Phòng đạt tiêu chuẩn) — cần biết trước Phòng đạt tiêu
      // chuẩn ĐÍCH cùng kho để lúc "Hoàn thành xử lý" cộng đúng chỗ (xem PATCH
      // /api/order-processing-requests/[id]) — phòng nguồn không phải phòng bán được nên không thể cộng
      // dư ngược lại đó như tier "mở túi" thường trong Phòng đạt tiêu chuẩn.
      let targetRoomId: string | null = null;
      if (item.lot.room!.type !== "PHONG_DAT_TIEU_CHUAN") {
        const warehouseId = item.lot.room!.warehouseId;
        if (!targetRoomCache.has(warehouseId)) {
          const targetRoom = await tx.room.findFirst({
            where: { warehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true },
            select: { id: true },
          });
          targetRoomCache.set(warehouseId, targetRoom?.id ?? null);
        }
        targetRoomId = targetRoomCache.get(warehouseId) ?? null;
        if (!targetRoomId) {
          throw new Error(`Kho chứa lô ${item.lot.stageCode} chưa có Phòng đạt tiêu chuẩn — liên hệ Admin trước khi xác nhận`);
        }
      }

      const bagSize = FINISHED_SPEC_BAG_SIZE[item.lot.stageCode as keyof typeof FINISHED_SPEC_BAG_SIZE] ?? 1;
      const code = await generateOrderProcessingRequestCode(tx);
      const processingRequest = await tx.orderProcessingRequest.create({
        data: {
          code,
          orderId: order.id,
          orderItemId: item.id,
          roomId: item.lot.roomId!,
          targetRoomId,
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

      // Đơn môi trường cho đơn xử lý này — số lượng = deductQuantity (cả túi nguồn đã mở ra để tách/ghép),
      // ghi rõ trong notes đây là môi trường phục vụ đơn xử lý nào (xem comment ProcessingMediumOrder).
      if (defaultMediumType) {
        const mediumOrderCode = await generateProcessingMediumOrderCode(tx);
        await tx.processingMediumOrder.create({
          data: {
            code: mediumOrderCode,
            processingRequestId: processingRequest.id,
            mediumTypeId: defaultMediumType.id,
            quantity: item.quantity,
            notes: `Đơn môi trường cho đơn xử lý ${processingRequest.code} (đơn hàng ${order.code})`,
          },
        });
        mediumOrderCount += 1;
      }
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

  if (mediumOrderCount > 0) {
    await createAlert({
      type: "MEDIUM_ORDER_CREATED",
      title: "Có đơn đặt hàng môi trường mới",
      message: `Đơn ${order.code} cần ${mediumOrderCount} đơn môi trường mới cho việc xử lý tách/ghép túi — xem trang Đơn đặt hàng MT`,
      targetRole: "MOI_TRUONG",
      relatedId: order.id,
      relatedType: "Order",
    });
  }

  return NextResponse.json({ success: true, processingRequestCount });
}

// "Xóa đơn tạm giữ" — Sale tự huỷ đơn của mình khi còn HELD (VD khách đổi ý trước khi xác nhận), xử lý
// giống hệt đơn hết hạn holdUntil tự động CANCELLED (xem ensureExpiredOrdersCancelled ở
// src/lib/order-lifecycle.ts): chỉ đổi status, KHÔNG đụng tới Lot.quantity — vì mọi phép tính tồn đạt
// tiêu chuẩn chỉ trừ đơn đang HELD/CONFIRMED, chuyển sang CANCELLED là tự động "hoàn tồn đạt tiêu chuẩn" ngay.
// Đơn HELD chưa từng phát sinh Yêu cầu xử lý cây (chỉ tạo lúc "Xác nhận") nên không cần huỷ theo.
async function cancelOrder(orderId: string, user: { id: string; role: string | null }) {
  if (!canActAsSale(user.role)) {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được chức năng này" }, { status: 403 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, saleId: true, status: true } });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  // Quản lý kho thành phẩm hủy HỘ được mọi đơn — cùng lý do với confirmOrder ở trên.
  if (user.role === "SALE" && order.saleId !== user.id) {
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
  if (user.role !== "KHO_THANH_PHAM" && user.role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          lot: { select: { id: true, stageCode: true, quantity: true, status: true } },
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

  // Dòng trỏ vào lô "ảo" (Kế hoạch nhập kho chưa về, xem src/lib/order-availability.ts) chưa có hàng
  // thật — chặn xuất kho, báo Kho thành phẩm xác nhận số liệu thật của kế hoạch trước (trang Nhập hàng).
  const plannedCount = order.items.filter((i) => !i.processingRequest && i.lot.status === "PLANNED").length;
  if (plannedCount > 0) {
    return NextResponse.json(
      { message: `Còn ${plannedCount} dòng đang chờ hàng dự kiến về thật — xác nhận Kế hoạch nhập kho tại trang Nhập hàng trước khi xuất kho` },
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

    if (order.assignedToId && order.assignedById) {
      await createAlert({
        type: "ASSIGNED_TASK_COMPLETED",
        title: "NV đã hoàn thành việc được giao",
        message: `Đã xuất kho xong đơn hàng ${order.code}`,
        userId: order.assignedById,
        relatedId: order.id,
        relatedType: "Order",
      });
    }

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
    if (parsed.data.action === "assign") return await assignOrder(id, session.user, parsed.data.assignedToId);
    if (parsed.data.action === "ack") return await ackOrder(id, session.user);
    return await shipOrder(id, session.user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }
}
