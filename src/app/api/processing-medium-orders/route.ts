import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Danh sách đơn môi trường phát sinh cho đơn xử lý (ProcessingMediumOrder) — NV môi trường xem để pha,
// Admin/QUẢN LÝ KHO THÀNH PHẨM xem để theo dõi (đơn hàng của mình phát sinh ra yêu cầu này).
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await prisma.processingMediumOrder.findMany({
    include: {
      mediumType: { select: { code: true, name: true } },
      processingRequest: {
        select: {
          code: true,
          sourceStageCode: true,
          plantType: { select: { name: true } },
          order: { select: { code: true } },
        },
      },
      completedBy: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(orders);
}
