import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().min(2).optional(),
  managerId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền sửa Vườn sản xuất" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { managerId } = parsed.data;

  if (managerId) {
    const manager = await prisma.user.findUnique({ where: { id: managerId }, select: { role: true } });
    if (!manager || manager.role !== "NHAN_VIEN_QUAN_LY_VUON") {
      return NextResponse.json({ message: "Chỉ gán được NV Quản lý vườn làm người quản lý" }, { status: 400 });
    }
  }

  const item = await prisma.productionGarden.update({
    where: { id },
    data: { ...parsed.data, managerId: managerId === undefined ? undefined : managerId || null },
    include: { manager: { select: { id: true, code: true, name: true } } },
  });
  return NextResponse.json(item);
}

// Xóa cứng — chặn nếu đã có đề xuất Trồng tham chiếu tới (ContaminationProposal.productionGardenId).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền xóa Vườn sản xuất" }, { status: 403 });
  }

  const { id } = await params;
  const garden = await prisma.productionGarden.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!garden) return NextResponse.json({ message: "Không tìm thấy Vườn sản xuất" }, { status: 404 });

  const proposalCount = await prisma.contaminationProposal.count({ where: { productionGardenId: id } });
  if (proposalCount > 0) {
    return NextResponse.json(
      { message: `Không thể xóa — Vườn "${garden.code}" đã có ${proposalCount} đề xuất Trồng tham chiếu tới` },
      { status: 409 }
    );
  }

  await prisma.productionGarden.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
