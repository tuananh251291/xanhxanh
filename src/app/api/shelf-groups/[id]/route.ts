import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1, "Cần nhập tên nhóm"),
  type: z.string().trim().optional(),
  rotationKind: z.enum(["RA_RE", "MAU_ME"]).nullable().optional(),
  rotationOrder: z.number().int().positive().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { name, type, rotationKind, rotationOrder } = parsed.data;
  if (rotationKind && !rotationOrder) {
    return NextResponse.json({ message: "Nhóm xoay vòng cần nhập thứ tự khe (rotationOrder)" }, { status: 400 });
  }

  const group = await prisma.shelfGroup.update({
    where: { id },
    data: {
      name,
      type: type || null,
      ...(rotationKind !== undefined ? { rotationKind, rotationOrder: rotationKind ? rotationOrder : null } : {}),
    },
  });
  return NextResponse.json(group);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  // Gỡ Nhóm khỏi mọi kệ đang gán trước khi xoá — không xoá kệ, chỉ bỏ groupId/rotationGroupId (thuộc
  // tính không bắt buộc).
  await prisma.$transaction([
    prisma.shelf.updateMany({ where: { groupId: id }, data: { groupId: null } }),
    prisma.shelf.updateMany({ where: { rotationGroupId: id }, data: { rotationGroupId: null } }),
    prisma.shelfGroup.delete({ where: { id } }),
  ]);
  return NextResponse.json({ success: true });
}
