import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  const where: Record<string, unknown> = {};
  // KY_THUAT chỉ thấy đơn có ít nhất 1 chỉ định do mình tạo — MOI_TRUONG/KHO_MO/Admin thấy tất cả
  // (giống quy ước đang dùng ở /api/instructions).
  if (role === "KY_THUAT") where.instructions = { some: { createdById: session.user.id } };
  // NV môi trường chỉ làm việc 1 kho sản xuất (nếu đã được gán) — 1 đơn có thể gộp chỉ định từ nhiều
  // kho nếu cùng tuần, nên chỉ cần có ít nhất 1 chỉ định thuộc đúng kho là hiện (best-effort — đơn vẫn
  // có thể lẫn chỉ định của kho khác nếu KY_THUAT gộp tuần đó cho cả 2 kho).
  if (role === "MOI_TRUONG" && session.user.workplaceWarehouseId) {
    where.instructions = { some: { items: { some: { shelf: { warehouseId: session.user.workplaceWarehouseId } } } } };
  }

  const orders = await prisma.mediumOrder.findMany({
    where,
    include: {
      instructions: { select: { code: true, plantType: { select: { name: true } } } },
      items: { include: { mediumType: { select: { code: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(orders);
}
