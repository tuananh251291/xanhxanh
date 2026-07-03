import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

// Admin chỉ định kệ này chuyên xếp loại cây nào — null = bỏ chỉ định (kệ dùng chung, chưa ràng buộc).
const patchSchema = z.object({
  plantTypeId: z.string().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  // Đổi loại cây khi kệ đang còn lô mẫu mẹ khác loại thì sẽ gây nhầm lẫn — chặn lại.
  if (parsed.data.plantTypeId) {
    const mismatched = await prisma.lot.count({
      where: { shelfId: id, status: "ACTIVE", plantTypeId: { not: parsed.data.plantTypeId } },
    });
    if (mismatched > 0) {
      return NextResponse.json({ message: "Kệ đang có lô của loại cây khác — chuyển/xử lý hết lô cũ trước khi đổi" }, { status: 409 });
    }
  }

  const shelf = await prisma.shelf.update({
    where: { id },
    data: { plantTypeId: parsed.data.plantTypeId },
    include: { plantType: { select: { code: true, name: true } } },
  });

  return NextResponse.json(shelf);
}
