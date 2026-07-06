import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateInstructionCode, generateMediumOrderCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { buildInstructionMediumNeeds, aggregateMediumOrderItems, getOrderWeekRange } from "@/lib/medium-orders";
import { isAdminRole } from "@/types";
import { z } from "zod";

// Mỗi dòng = 1 quy cách nguồn (M03 hoặc M05) được dùng, lấy từ 1 lô cụ thể trên 1 kệ. Một kệ có thể sinh
// nhiều dòng nếu kệ đó có cả M03 và M05. Mỗi dòng tự có tỉ lệ + môi trường riêng — output KHÔNG dây chuyền
// qua nhau: dự kiến mẫu mẹ = quantity × motherSampleRatio, dự kiến thành phẩm = quantity × rootingRatio
// (độc lập). Môi trường cũng tách riêng: 1 để nhân mẫu mẹ, 1 để ra rễ thành cây thành phẩm.
const shelfItemSchema = z.object({
  shelfId: z.string(),
  lotId: z.string(),
  stageCode: z.enum(["M03", "M05"]),
  quantity: z.number().int().positive(),
  motherSampleRatio: z.number().positive(),
  rootingRatio: z.number().positive(),
  motherMediumTypeId: z.string().min(1),
  finishedMediumTypeId: z.string().min(1),
});

const createSchema = z.object({
  plantTypeId: z.string(),
  weekStart: z.string().optional(),
  notes: z.string().optional(),
  shelfItems: z.array(shelfItemSchema).min(1, "Cần chọn ít nhất 1 dòng quy cách nguồn"),
  // Kế hoạch phân bổ thành phẩm dự kiến theo quy cách đóng gói (T01/T05) — chỉ để đối chiếu sau này,
  // lô thành phẩm thật sự tạo ra khi NV cấy nhập nhật ký sẽ tự chọn quy cách theo thực tế.
  plannedT01Quantity: z.number().int().min(0).default(0),
  plannedT05Quantity: z.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const role = session.user.role;
  const userId = session.user.id;

  const where: Record<string, unknown> = {};
  if (role === "CAY_MO") where.assignedToId = userId;
  if (role === "KY_THUAT") where.createdById = userId;

  const status = searchParams.get("status");
  if (status) where.status = status;

  const instructions = await prisma.plantingInstruction.findMany({
    where,
    include: {
      plantType: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      items: {
        include: {
          shelf: { select: { code: true, name: true } },
          motherMedium: { select: { code: true, name: true } },
          finishedMedium: { select: { code: true, name: true } },
        },
      },
      _count: { select: { dailyRecords: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(instructions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role) && session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });

  const { shelfItems, plantTypeId, weekStart, notes, plannedT01Quantity, plannedT05Quantity } = parsed.data;

  // Chỉ định cấy chỉ được lấy nguồn từ kệ trong Phòng mẫu mẹ của Kho sản xuất — chặn ở server phòng khi
  // client gửi thẳng lên (bỏ qua dropdown đã lọc sẵn ở UI).
  const shelfIds = Array.from(new Set(shelfItems.map((item) => item.shelfId)));
  const validShelves = await prisma.shelf.findMany({
    where: { id: { in: shelfIds }, room: { type: "PHONG_MAU_ME", warehouse: { type: "SAN_XUAT" } } },
    select: { id: true, code: true, assignedStaffId: true, warehouse: { select: { code: true } } },
  });
  if (validShelves.length !== shelfIds.length) {
    return NextResponse.json({ message: "Chỉ được chọn kệ trong Phòng mẫu mẹ của Kho sản xuất" }, { status: 400 });
  }

  // Kệ Phòng mẫu mẹ "đã chia" (gắn sẵn 1 NV cấy mô cụ thể) → tự động gán luôn NV đó cho chỉ định,
  // Kho mô không cần chọn tay. Kệ "chung" (chưa gắn NV) → để trống, Kho mô tự chọn sau (AssignStaffCell).
  const distinctStaffIds = new Set(validShelves.map((s) => s.assignedStaffId).filter((id): id is string => !!id));
  const autoAssignedToId = distinctStaffIds.size === 1 && validShelves.every((s) => s.assignedStaffId)
    ? [...distinctStaffIds][0]
    : undefined;

  // NV cấy mô chỉ nhận chỉ định tuần mới sau khi chỉ định hiện tại đã "Kết thúc" — chặn ngay ở bước tạo
  // để tránh 1 NV cùng lúc gánh 2 chỉ định.
  if (autoAssignedToId) {
    const stillActive = await prisma.plantingInstruction.findFirst({
      where: { assignedToId: autoAssignedToId, status: "ACTIVE" },
      select: { code: true },
    });
    if (stillActive) {
      return NextResponse.json(
        { message: `Nhân viên cấy mô này còn chỉ định ${stillActive.code} chưa kết thúc, không thể nhận chỉ định mới` },
        { status: 400 }
      );
    }
  }

  const itemsWithOutput = shelfItems.map((item) => ({
    ...item,
    expectedMotherOutput: Math.floor(item.quantity * item.motherSampleRatio),
    expectedFinishedOutput: Math.floor(item.quantity * item.rootingRatio),
  }));

  const inputMotherQuantity = itemsWithOutput.reduce((sum, item) => sum + item.quantity, 0);
  const expectedMotherOutput = itemsWithOutput.reduce((sum, item) => sum + item.expectedMotherOutput, 0);
  const expectedFinishedOutput = itemsWithOutput.reduce((sum, item) => sum + item.expectedFinishedOutput, 0);

  // Mã chỉ định gắn với giàn kệ nguồn — cả nhóm shelfItems chỉ chọn từ 1 kệ duy nhất theo quy trình
  // tạo chỉ định hiện tại, nên lấy kệ đầu tiên làm căn cứ sinh mã.
  const code = await generateInstructionCode({
    warehouseCode: validShelves[0].warehouse.code,
    shelfCode: validShelves[0].code,
  });

  const instruction = await prisma.plantingInstruction.create({
    data: {
      code,
      plantType: { connect: { id: plantTypeId } },
      createdBy: { connect: { id: session!.user.id } },
      assignedTo: autoAssignedToId ? { connect: { id: autoAssignedToId } } : undefined,
      notes,
      inputMotherQuantity,
      expectedMotherOutput,
      expectedFinishedOutput,
      plannedT01Quantity,
      plannedT05Quantity,
      weekStart: weekStart ? new Date(weekStart) : undefined,
      status: "ACTIVE",
      items: {
        create: itemsWithOutput.map((item) => ({
          shelfId: item.shelfId,
          lotId: item.lotId,
          stageCode: item.stageCode,
          quantity: item.quantity,
          motherSampleRatio: item.motherSampleRatio,
          rootingRatio: item.rootingRatio,
          expectedMotherOutput: item.expectedMotherOutput,
          expectedFinishedOutput: item.expectedFinishedOutput,
          motherMediumTypeId: item.motherMediumTypeId,
          finishedMediumTypeId: item.finishedMediumTypeId,
        })),
      },
    },
    include: {
      plantType: true,
      assignedTo: { select: { name: true } },
      items: { include: { shelf: true, lot: true, motherMedium: true, finishedMedium: true } },
    },
  });

  // Tự động sinh/gộp đơn đặt hàng môi trường cho NV môi trường ngay khi chỉ định được tạo. Nhiều chỉ
  // định cùng tuần thực hiện (weekStart) — KY_THUAT thường ra nhiều chỉ định trước Thứ 5 tuần này, tất
  // cả dùng cho tuần sau — gộp chung vào 1 đơn, cộng dồn số lượng theo từng quy cách (xem
  // lib/medium-orders.ts). Chỉ gộp vào đơn CHƯA xác nhận; nếu đơn của tuần đó đã được MOI_TRUONG xác
  // nhận rồi, chỉ định muộn sẽ mở 1 đơn mới riêng thay vì âm thầm đổi số liệu đơn đang thực hiện.
  const instructionNeeds = buildInstructionMediumNeeds(instruction.items, plannedT01Quantity, plannedT05Quantity);
  if (instructionNeeds.length > 0) {
    const targetWeekStart = instruction.weekStart ?? instruction.createdAt;
    const { weekStart: orderWeekStart, weekEnd: orderWeekEnd, days } = getOrderWeekRange(targetWeekStart);

    const existingOrder = await prisma.mediumOrder.findFirst({
      where: { weekStart: orderWeekStart, confirmedAt: null },
      include: { instructions: { include: { items: true } } },
    });

    let order: { id: string; code: string };
    let isNewOrder = false;

    if (existingOrder) {
      await prisma.plantingInstruction.update({ where: { id: instruction.id }, data: { mediumOrderId: existingOrder.id } });

      const allNeeds = [
        ...existingOrder.instructions.map((inst) => buildInstructionMediumNeeds(inst.items, inst.plannedT01Quantity ?? 0, inst.plannedT05Quantity ?? 0)),
        instructionNeeds,
      ];
      await prisma.mediumOrderItem.deleteMany({ where: { orderId: existingOrder.id } });
      order = await prisma.mediumOrder.update({
        where: { id: existingOrder.id },
        data: { items: { create: aggregateMediumOrderItems(allNeeds) } },
      });
    } else {
      const orderCode = await generateMediumOrderCode();
      order = await prisma.mediumOrder.create({
        data: {
          code: orderCode,
          weekStart: orderWeekStart,
          weekEnd: orderWeekEnd,
          instructions: { connect: { id: instruction.id } },
          items: { create: instructionNeeds },
          days: { create: days.map((date) => ({ date })) },
        },
      });
      isNewOrder = true;
    }

    await createAlert({
      type: "MEDIUM_ORDER_CREATED",
      title: isNewOrder ? "Có đơn đặt hàng môi trường mới" : "Đơn đặt hàng môi trường đã được cập nhật",
      message: isNewOrder
        ? `Chỉ định ${code} cần pha môi trường — xem đơn ${order.code}`
        : `Chỉ định ${code} vừa được gộp vào đơn ${order.code} — số lượng cần đã cập nhật`,
      targetRole: "MOI_TRUONG",
      relatedId: order.id,
      relatedType: "MediumOrder",
    });
  }

  return NextResponse.json(instruction, { status: 201 });
}
