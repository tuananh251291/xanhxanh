import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { generateOrderProcessingRequestCode, generateProcessingMediumOrderCode } from "@/lib/codes";
import { FINISHED_SPEC_BAG_SIZE, ORDER_DEPOSITED_RELATED_TYPE } from "@/types";
import { notifyWarehouseManagers } from "@/lib/supplier-check-notify";

export const loadOrderForConfirm = (orderId: string) =>
  prisma.order.findUnique({
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

type DepositInput = { depositAmount?: number; depositedAt?: string };

// Đơn chuyển HELD → CONFIRMED: sinh Yêu cầu xử lý cây + đơn môi trường, báo Kho thành phẩm. Dùng chung cho nút "Khách đã cọc"
// và đơn Kho thị trường (tạo xong coi như đã cọc). Trả về số Yêu cầu xử lý đã sinh.
export async function applyOrderConfirmation(order: NonNullable<Awaited<ReturnType<typeof loadOrderForConfirm>>>, deposit: DepositInput = {}): Promise<number> {
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
      const lot = item.lot;
      if (!lot) throw new Error("Dòng cần xử lý cây chưa có lô nguồn — liên hệ Quản lý kho thành phẩm");

      // Nguồn ở Kho hàn túi/Theo dõi (không phải Phòng đạt tiêu chuẩn) — cần biết trước Phòng đạt tiêu
      // chuẩn ĐÍCH cùng kho để lúc "Hoàn thành xử lý" cộng đúng chỗ (xem PATCH
      // /api/order-processing-requests/[id]) — phòng nguồn không phải phòng bán được nên không thể cộng
      // dư ngược lại đó như tier "mở túi" thường trong Phòng đạt tiêu chuẩn.
      let targetRoomId: string | null = null;
      if (lot.room!.type !== "PHONG_DAT_TIEU_CHUAN") {
        const warehouseId = lot.room!.warehouseId;
        if (!targetRoomCache.has(warehouseId)) {
          const targetRoom = await tx.room.findFirst({
            where: { warehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true },
            select: { id: true },
          });
          targetRoomCache.set(warehouseId, targetRoom?.id ?? null);
        }
        targetRoomId = targetRoomCache.get(warehouseId) ?? null;
        if (!targetRoomId) {
          throw new Error(`Kho chứa lô ${lot.stageCode} chưa có Phòng đạt tiêu chuẩn — liên hệ Admin trước khi xác nhận`);
        }
      }

      const bagSize = FINISHED_SPEC_BAG_SIZE[lot.stageCode as keyof typeof FINISHED_SPEC_BAG_SIZE] ?? 1;
      const code = await generateOrderProcessingRequestCode(tx);
      const processingRequest = await tx.orderProcessingRequest.create({
        data: {
          code,
          orderId: order.id,
          orderItemId: item.id,
          roomId: lot.roomId!,
          targetRoomId,
          plantTypeId: lot.plantTypeId,
          sourceLotId: lot.id,
          sourceStageCode: lot.stageCode,
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

    await tx.order.update({ where: { id: order.id }, data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      depositAmount: deposit.depositAmount,
      depositedAt: deposit.depositedAt ? new Date(`${deposit.depositedAt}T00:00:00+07:00`) : undefined,
    } });
  }, { timeout: 30000, maxWait: 10000 });

  const [sale, nccToPlace] = await Promise.all([
    prisma.user.findUnique({ where: { id: order.saleId }, select: { workplaceWarehouseId: true } }),
    prisma.supplierCheck.count({ where: { orderId: order.id, status: "CONFIRMED" } }),
  ]);
  await notifyWarehouseManagers(
    "ORDER_PENDING_PACK",
    `Đơn ${order.code}: khách đã cọc`,
    nccToPlace > 0 ? `Đơn ${order.code} có phần NCC cần đặt hàng — bấm để mở đơn, đặt hàng NCC và bàn giao NV kho` : `Đơn ${order.code} đã chuyển sang chờ xuất kho — bấm để mở đơn và bàn giao NV kho`,
    order.id,
    ORDER_DEPOSITED_RELATED_TYPE,
    sale?.workplaceWarehouseId
  );

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
      title: "Có phiếu báo giá môi trường mới",
      message: `Đơn ${order.code} cần ${mediumOrderCount} đơn môi trường mới cho việc xử lý tách/ghép túi — xem trang Phiếu báo giá MT`,
      targetRole: "MOI_TRUONG",
      relatedId: order.id,
      relatedType: "Order",
    });
  }

  return processingRequestCount;
}
