import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { isSameDay } from "date-fns";
import { z } from "zod";

const patchSchema = z.union([
  z.object({ m03: z.number().int().min(0), m05: z.number().int().min(0), t01: z.number().int().min(0), t05: z.number().int().min(0) }),
  z.object({ action: z.literal("handover") }),
  z.object({ action: z.literal("confirm") }),
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

  if (session?.user?.role !== "MOI_TRUONG") {
    return NextResponse.json({ message: "Chỉ NV môi trường mới thao tác được" }, { status: 403 });
  }
  if (day.handedOverAt) {
    return NextResponse.json({ message: "Ngày này đã bàn giao, không thể sửa" }, { status: 400 });
  }
  // Chỉ được nhập số liệu/bàn giao đúng ngày thực tế — tránh nhập bù trước hoặc sửa lại ngày đã qua.
  if (!isSameDay(day.date, new Date())) {
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

  if ("m03" in parsed.data) {
    const updated = await prisma.mediumOrderDay.update({
      where: { id: dayId },
      data: parsed.data,
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
}
