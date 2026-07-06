import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> =
    status === "pending" ? { handedOverAt: { not: null }, confirmedAt: null } : {};
  // NV kho mô chỉ làm việc 1 kho sản xuất (nếu đã được gán) — xem ghi chú best-effort tương tự
  // /api/medium-orders (1 đơn có thể gộp chỉ định của cả 2 kho nếu cùng tuần).
  if (session.user.role === "KHO_MO" && session.user.workplaceWarehouseId) {
    where.order = { instructions: { some: { items: { some: { shelf: { warehouseId: session.user.workplaceWarehouseId } } } } } };
  }

  const days = await prisma.mediumOrderDay.findMany({
    where,
    include: {
      order: {
        select: {
          code: true,
          instructions: { select: { code: true, plantType: { select: { name: true } } } },
        },
      },
    },
    orderBy: { handedOverAt: "asc" },
    take: 100,
  });

  return NextResponse.json(days);
}
