import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateMediumOrderCode } from "@/lib/codes";
import { buildInstructionMediumNeeds, aggregateMediumOrderItems, getOrderWeekRange } from "@/lib/medium-orders";

type ItemForNeeds = {
  stageCode: string | null;
  quantity: number;
  motherMediumTypeId: string | null;
  expectedFinishedOutput: number | null;
  finishedMediumTypeId: string | null;
  preRootingMotherMediumTypeId: string | null;
};

// Gỡ 1 chỉ định khỏi đơn đặt hàng môi trường đang gắn (dùng khi SỬA chỉ định — số lượng/tỉ lệ/môi
// trường đổi thì nhu cầu môi trường của chỉ định đó cũng đổi theo, cần tính lại). Tính lại items của
// đơn từ các chỉ định CÒN LẠI (loại bỏ chỉ định này); xoá luôn đơn nếu không còn chỉ định nào khác dùng
// — giống hệt cách dọn dẹp thủ công khi 1 chỉ định bị xoá hẳn. CHỈ gọi khi đơn CHƯA được NV môi trường
// xác nhận (confirmedAt null) — gọi ở nơi kiểm tra trước, không tự kiểm tra lại ở đây.
export async function detachInstructionFromMediumOrder(
  tx: Prisma.TransactionClient,
  instructionId: string,
  mediumOrderId: string
): Promise<void> {
  const order = await tx.mediumOrder.findUnique({
    where: { id: mediumOrderId },
    include: { instructions: { where: { id: { not: instructionId } }, include: { items: true } } },
  });
  if (!order) return;

  await tx.plantingInstruction.update({ where: { id: instructionId }, data: { mediumOrderId: null } });

  if (order.instructions.length === 0) {
    await tx.alert.deleteMany({ where: { relatedType: "MediumOrder", relatedId: order.id } });
    await tx.mediumOrderItem.deleteMany({ where: { orderId: order.id } });
    await tx.mediumOrderDay.deleteMany({ where: { orderId: order.id } });
    await tx.mediumOrder.delete({ where: { id: order.id } });
    return;
  }

  const remainingNeeds = order.instructions.map((inst) =>
    buildInstructionMediumNeeds(inst.items, inst.plannedT01Quantity ?? 0, inst.plannedT05Quantity ?? 0)
  );
  await tx.mediumOrderItem.deleteMany({ where: { orderId: order.id } });
  await tx.mediumOrder.update({ where: { id: order.id }, data: { items: { create: aggregateMediumOrderItems(remainingNeeds) } } });
}

// Gộp/tạo đơn đặt hàng môi trường cho 1 chỉ định — dùng chung cho lúc TẠO MỚI (POST /api/instructions)
// lẫn lúc SỬA (PATCH .../edit, sau khi đã detachInstructionFromMediumOrder khỏi đơn cũ nếu có). Chạy
// SAU transaction chính (không truyền tx) — giống hệt cách POST vốn đã làm (sinh mã đơn theo kiểu đọc-
// rồi-quyết, xem generateMediumOrderCode ở src/lib/codes.ts), không phải trong tx.
export async function syncInstructionMediumOrder(
  instruction: { id: string; code: string; weekStart: Date | null; createdAt: Date },
  items: ItemForNeeds[],
  plannedT01Quantity: number,
  plannedT05Quantity: number
): Promise<void> {
  const instructionNeeds = buildInstructionMediumNeeds(items, plannedT01Quantity, plannedT05Quantity);
  if (instructionNeeds.length === 0) return;

  const targetWeekStart = instruction.weekStart ?? instruction.createdAt;
  const { weekStart: orderWeekStart, weekEnd: orderWeekEnd, days } = getOrderWeekRange(targetWeekStart);

  const existingOrder = await prisma.mediumOrder.findFirst({
    where: { weekStart: orderWeekStart, confirmedAt: null },
    include: { instructions: { include: { items: true } } },
  });

  if (existingOrder) {
    await prisma.plantingInstruction.update({ where: { id: instruction.id }, data: { mediumOrderId: existingOrder.id } });
    const allNeeds = [
      ...existingOrder.instructions
        .filter((inst) => inst.id !== instruction.id)
        .map((inst) => buildInstructionMediumNeeds(inst.items, inst.plannedT01Quantity ?? 0, inst.plannedT05Quantity ?? 0)),
      instructionNeeds,
    ];
    await prisma.mediumOrderItem.deleteMany({ where: { orderId: existingOrder.id } });
    await prisma.mediumOrder.update({
      where: { id: existingOrder.id },
      data: { items: { create: aggregateMediumOrderItems(allNeeds) } },
    });
  } else {
    const orderCode = await generateMediumOrderCode();
    await prisma.mediumOrder.create({
      data: {
        code: orderCode,
        weekStart: orderWeekStart,
        weekEnd: orderWeekEnd,
        instructions: { connect: { id: instruction.id } },
        items: { create: instructionNeeds },
        days: { create: days.map((date) => ({ date })) },
      },
    });
  }

  // Không báo NV môi trường ở đây — đơn chỉ thật sự "gửi" (hiện + có thông báo) lúc 00:00 Thứ 7, xem
  // ensureMediumOrdersSent ở src/lib/medium-order-lifecycle.ts (chạy mỗi lần tải trang, giống mọi việc
  // "tự động" khác trong app này).
}
