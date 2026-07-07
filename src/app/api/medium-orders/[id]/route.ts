import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isMediumOrderInProgress } from "@/lib/medium-orders";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const order = await prisma.mediumOrder.findUnique({
    where: { id },
    include: {
      instructions: { select: { code: true, plantType: { select: { name: true } } } },
      items: { include: { mediumType: { select: { code: true, name: true } } } },
      days: { orderBy: { date: "asc" } },
    },
  });
  if (!order) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(order);
}

const patchSchema = z.object({ action: z.literal("confirm") });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "MOI_TRUONG") {
    return NextResponse.json({ message: "Chỉ NV môi trường mới xác nhận được đơn" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { id } = await params;
  const order = await prisma.mediumOrder.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  // Mỗi NV môi trường chỉ được xử lý 1 đơn "đang thực hiện" tại 1 thời điểm — chặn xác nhận đơn mới nếu
  // đơn khác do chính người này xác nhận trước đó chưa kết thúc (xem isMediumOrderInProgress).
  if (!order.confirmedAt) {
    const myOrders = await prisma.mediumOrder.findMany({
      where: { confirmedById: session!.user.id, confirmedAt: { not: null } },
      include: { days: { select: { handedOverAt: true, confirmedAt: true } } },
    });
    if (myOrders.some((o) => isMediumOrderInProgress(o))) {
      return NextResponse.json({ message: "Bạn cần hoàn thành đơn sản xuất hiện tại" }, { status: 400 });
    }
  }

  const updated = await prisma.mediumOrder.update({
    where: { id },
    data: { confirmedAt: order.confirmedAt ?? new Date(), confirmedById: order.confirmedById ?? session!.user.id },
  });
  return NextResponse.json(updated);
}
