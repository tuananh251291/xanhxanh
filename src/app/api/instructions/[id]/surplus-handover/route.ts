import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateLotCode, generateTransferCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { SURPLUS_TRANSFER_TAG } from "@/types";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "CAY_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const { id } = await params;

  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id },
    include: {
      plantType: { select: { code: true } },
      items: { include: { shelf: { select: { warehouseId: true } } } },
    },
  });
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });
  if (instruction.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Không phải chỉ định của bạn" }, { status: 403 });
  }
  if (instruction.status !== "ENDED" || instruction.endReason !== "TIME_UP") {
    return NextResponse.json({ message: "Chỉ định chưa kết thúc do hết thời gian — chưa thể bàn giao MM dư" }, { status: 400 });
  }
  if (instruction.surplusHandedOverAt) {
    return NextResponse.json({ message: "Đã bàn giao MM dư cho chỉ định này rồi" }, { status: 409 });
  }

  // MM dư = tổng mẫu mẹ được cấp (đầu vào) trừ tổng "MM đã kiểm tra" đã nhập qua các ngày.
  const checkedAgg = await prisma.dailyRecord.aggregate({
    where: { instructionId: id },
    _sum: { motherChecked: true },
  });
  const totalChecked = checkedAgg._sum.motherChecked ?? 0;
  const surplus = instruction.inputMotherQuantity - totalChecked;
  if (surplus <= 0) {
    return NextResponse.json({ message: "Không còn mẫu mẹ dư để bàn giao" }, { status: 400 });
  }

  const staffUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } });

  // Chia phần dư theo tỉ trọng số lượng nguồn của từng dòng quy cách (M03/M05) trong chỉ định — nếu
  // chỉ dùng 1 quy cách thì toàn bộ phần dư thuộc quy cách đó.
  const totalInputQty = instruction.items.reduce((s, i) => s + i.quantity, 0);
  const stageGroups = Array.from(new Set(instruction.items.map((i) => i.stageCode).filter((c): c is string => !!c)));
  const splits: { stageCode: string; quantity: number }[] = [];
  let remaining = surplus;
  stageGroups.forEach((stageCode, idx) => {
    const groupQty = instruction.items.filter((i) => i.stageCode === stageCode).reduce((s, i) => s + i.quantity, 0);
    const isLast = idx === stageGroups.length - 1;
    const qty = isLast ? remaining : Math.round((groupQty / totalInputQty) * surplus);
    remaining -= qty;
    if (qty > 0) splits.push({ stageCode, quantity: qty });
  });

  const lotsCreated = [];
  for (const split of splits) {
    const code = await generateLotCode({
      plantTypeCode: instruction.plantType.code,
      staffCode: staffUser?.code ?? "000",
      stageCode: split.stageCode,
    });
    const lot = await prisma.lot.create({
      data: {
        code,
        plantTypeId: instruction.plantTypeId,
        stage: "MAU_ME",
        stageCode: split.stageCode,
        quantity: split.quantity,
        initialQuantity: split.quantity,
        instructionId: id,
        status: "ACTIVE",
        enteredAt: new Date(),
      },
    });
    lotsCreated.push(lot);
  }

  const fromWarehouseId = instruction.items[0]?.shelf?.warehouseId;
  if (!fromWarehouseId) {
    return NextResponse.json({ message: "Không xác định được kho nguồn của chỉ định này" }, { status: 400 });
  }
  // Gắn fromRoomId = Phòng tối của kho nguồn để mọi KHO_MO đều thấy phiếu chờ nhận (giống quy ước
  // phiếu bàn giao hàng ngày chưa chỉ định người nhận cụ thể) — PATCH /api/transfers/[id] sẽ nhận diện
  // qua notes=SURPLUS_TRANSFER_TAG để xếp vào Kho quá hạn thay vì chạy thuật toán bàn giao hàng ngày.
  const darkRoom = await prisma.room.findFirst({ where: { warehouseId: fromWarehouseId, type: "PHONG_TOI" } });

  const code = await generateTransferCode();
  const transfer = await prisma.transfer.create({
    data: {
      code,
      fromWarehouseId,
      fromRoomId: darkRoom?.id,
      toWarehouseId: fromWarehouseId,
      fromUserId: session.user.id,
      notes: SURPLUS_TRANSFER_TAG,
      items: { create: lotsCreated.map((lot) => ({ lotId: lot.id, quantity: lot.quantity })) },
    },
    include: { items: { include: { lot: true } } },
  });

  await prisma.plantingInstruction.update({ where: { id }, data: { surplusHandedOverAt: new Date() } });

  await createAlert({
    type: "LOT_READY_TRANSFER",
    title: "Có phiếu bàn giao MM dư chờ nhận",
    message: `${session.user.name} đã gửi phiếu ${code} — bàn giao ${surplus.toLocaleString("vi-VN")} mẫu mẹ dư từ chỉ định ${instruction.code} đã kết thúc`,
    targetRole: "KHO_MO",
    relatedId: transfer.id,
    relatedType: "Transfer",
  });

  return NextResponse.json({ transfer, surplus }, { status: 201 });
}
