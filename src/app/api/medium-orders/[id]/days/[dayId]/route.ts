import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { isSameVnCalendarDay } from "@/lib/medium-orders";
import { isAdminRole } from "@/types";
import { z } from "zod";

const patchSchema = z.union([
  z.object({ items: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().min(0) })) }),
  z.object({ action: z.literal("handover") }),
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("undoHandover") }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; dayId: string }> }) {
  const session = await auth();
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { id, dayId } = await params;
  const day = await prisma.mediumOrderDay.findUnique({ where: { id: dayId } });
  if (!day || day.orderId !== id) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  // NV môi trường xác nhận đơn thì mới được sửa số/bàn giao — Kho mô xác nhận khâu cuối.
  if ("action" in parsed.data && parsed.data.action === "confirm") {
    if (session?.user?.role !== "KHO_MO") {
      return NextResponse.json({ message: "Chỉ NV kho mô mới xác nhận được bàn giao" }, { status: 403 });
    }
    if (!day.handedOverAt) {
      return NextResponse.json({ message: "Ngày này chưa được bàn giao" }, { status: 400 });
    }
    const updated = await prisma.mediumOrderDay.update({
      where: { id: dayId },
      data: { confirmedAt: day.confirmedAt ?? new Date(), confirmedById: day.confirmedById ?? session!.user.id },
    });
    return NextResponse.json(updated);
  }

  // Hoàn lại 1 ngày đã bàn giao (VD bấm nhầm/bàn giao sớm quên nhập số) — mở khoá sửa lại số liệu. Chỉ
  // hoàn lại được khi Kho mô CHƯA xác nhận (confirmedAt null) — coi như chưa có gì "chốt" thật sự. Không
  // có tác động tồn kho/vật lý nào cần hoàn ngược (khác Transfer Phòng tối) — MediumOrderDay chỉ ghi
  // nhận số liệu, chỉ cần xoá handedOverAt là NV môi trường sửa lại được (nếu vẫn đúng ngày hôm nay —
  // xem chặn "chỉ nhập đúng hôm nay" bên dưới, không nới ở đây).
  if ("action" in parsed.data && parsed.data.action === "undoHandover") {
    if (!day.handedOverAt) {
      return NextResponse.json({ message: "Ngày này chưa bàn giao — không có gì để hoàn lại" }, { status: 400 });
    }
    if (day.confirmedAt) {
      return NextResponse.json({ message: "Kho mô đã xác nhận nhận — không thể hoàn lại" }, { status: 400 });
    }
    const order = await prisma.mediumOrder.findUnique({ where: { id }, select: { confirmedById: true } });
    const isOwner = session?.user?.role === "MOI_TRUONG" && order?.confirmedById === session.user.id;
    const isKhoMo = session?.user?.role === "KHO_MO";
    if (!isOwner && !isKhoMo && !isAdminRole(session?.user?.role)) {
      return NextResponse.json({ message: "Không có quyền hoàn lại" }, { status: 403 });
    }
    const updated = await prisma.mediumOrderDay.update({ where: { id: dayId }, data: { handedOverAt: null } });
    return NextResponse.json(updated);
  }

  if (session?.user?.role !== "MOI_TRUONG") {
    return NextResponse.json({ message: "Chỉ NV môi trường mới thao tác được" }, { status: 403 });
  }
  if (day.handedOverAt) {
    return NextResponse.json({ message: "Ngày này đã bàn giao, không thể sửa" }, { status: 400 });
  }
  // Chỉ được nhập số liệu/bàn giao đúng ngày thực tế — tránh nhập bù trước hoặc sửa lại ngày đã qua.
  if (!isSameVnCalendarDay(day.date, new Date())) {
    return NextResponse.json({ message: "Chỉ được nhập liệu đúng với ngày hôm nay" }, { status: 400 });
  }

  if ("action" in parsed.data && parsed.data.action === "handover") {
    const updated = await prisma.mediumOrderDay.update({
      where: { id: dayId },
      data: { handedOverAt: new Date() },
    });
    const order = await prisma.mediumOrder.findUnique({ where: { id }, select: { code: true } });
    await createAlert({
      type: "MEDIUM_HANDOVER_READY",
      title: "Môi trường sẵn sàng bàn giao",
      message: `Đơn ${order?.code} ngày ${day.date.toLocaleDateString("vi-VN")} đã bàn giao, chờ Kho mô xác nhận`,
      targetRole: "KHO_MO",
      relatedId: id,
      relatedType: "MediumOrder",
    });
    return NextResponse.json(updated);
  }

  if ("items" in parsed.data) {
    const orderItems = await prisma.mediumOrderItem.findMany({ where: { orderId: id }, select: { id: true, stageCode: true } });
    const orderItemById = new Map(orderItems.map((i) => [i.id, i]));
    for (const { itemId } of parsed.data.items) {
      if (!orderItemById.has(itemId)) {
        return NextResponse.json({ message: "Có dòng quy cách không thuộc đơn này" }, { status: 400 });
      }
    }

    const stageTotals = { m05: 0, t01: 0, t05: 0 };
    for (const { itemId, quantity } of parsed.data.items) {
      const stageCode = orderItemById.get(itemId)!.stageCode.toLowerCase();
      if (stageCode === "m05" || stageCode === "t01" || stageCode === "t05") {
        stageTotals[stageCode] += quantity;
      }
    }

    const results = await prisma.$transaction([
      ...parsed.data.items.map(({ itemId, quantity }) =>
        prisma.mediumOrderDayItem.upsert({
          where: { dayId_itemId: { dayId, itemId } },
          create: { dayId, itemId, quantity },
          update: { quantity },
        })
      ),
      prisma.mediumOrderDay.update({ where: { id: dayId }, data: stageTotals, include: { dayItems: true } }),
    ]);
    const updated = results[results.length - 1];
    return NextResponse.json(updated);
  }

  return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
}
