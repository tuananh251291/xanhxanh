import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const patchSchema = z.object({ action: z.literal("complete") });

// NV môi trường bấm "Hoàn thành" sau khi đã pha xong — đơn này không có bước bàn giao/xác nhận riêng
// như MediumOrder (phát sinh đột xuất cho 1 đơn xử lý cụ thể, không theo lịch tuần).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "MOI_TRUONG") {
    return NextResponse.json({ message: "Chỉ NV môi trường mới dùng được chức năng này" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const order = await prisma.processingMediumOrder.findUnique({ where: { id }, select: { status: true } });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn môi trường" }, { status: 404 });
  if (order.status !== "PENDING") {
    return NextResponse.json({ message: "Đơn này đã hoàn thành" }, { status: 400 });
  }

  await prisma.processingMediumOrder.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date(), completedById: session.user.id },
  });

  return NextResponse.json({ success: true });
}
