import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const memberSelect = { id: true, code: true, name: true } as const;

const createSchema = z.object({
  name: z.string().min(2),
  memberPlantTypeIds: z.array(z.string()).min(2, "Cần chọn ít nhất 2 mã cây (mã gốc + ít nhất 1 biến thể)"),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(2).optional(),
  memberPlantTypeIds: z.array(z.string()).min(2, "Cần chọn ít nhất 2 mã cây (mã gốc + ít nhất 1 biến thể)").optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const groups = await prisma.plantVariantGroup.findMany({
    orderBy: { createdAt: "asc" },
    include: { members: { select: memberSelect, orderBy: { code: "asc" } } },
  });
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const { name, memberPlantTypeIds } = parsed.data;

  // Mỗi mã cây chỉ thuộc ĐÚNG 1 nhóm biến thể — chặn chọn mã đã có nhóm khác.
  const alreadyGrouped = await prisma.plantType.findMany({
    where: { id: { in: memberPlantTypeIds }, variantGroupId: { not: null } },
    select: { code: true },
  });
  if (alreadyGrouped.length > 0) {
    return NextResponse.json(
      { message: `Mã cây ${alreadyGrouped.map((p) => p.code).join(", ")} đã thuộc 1 nhóm biến thể khác` },
      { status: 409 }
    );
  }

  const group = await prisma.plantVariantGroup.create({
    data: {
      name,
      members: { connect: memberPlantTypeIds.map((id) => ({ id })) },
    },
    include: { members: { select: memberSelect, orderBy: { code: "asc" } } },
  });
  return NextResponse.json(group, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const { id, name, memberPlantTypeIds } = parsed.data;
  const group = await prisma.plantVariantGroup.findUnique({ where: { id }, include: { members: { select: { id: true } } } });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm biến thể" }, { status: 404 });

  if (memberPlantTypeIds) {
    // Mã cây đã thuộc nhóm KHÁC (không phải nhóm đang sửa) mới bị chặn — mã đang thuộc chính nhóm này
    // vẫn chọn lại được bình thường (giữ nguyên hoặc bớt đi).
    const alreadyGrouped = await prisma.plantType.findMany({
      where: { id: { in: memberPlantTypeIds }, variantGroupId: { not: null }, NOT: { variantGroupId: id } },
      select: { code: true },
    });
    if (alreadyGrouped.length > 0) {
      return NextResponse.json(
        { message: `Mã cây ${alreadyGrouped.map((p) => p.code).join(", ")} đã thuộc 1 nhóm biến thể khác` },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (memberPlantTypeIds) {
      const currentIds = group.members.map((m) => m.id);
      const removedIds = currentIds.filter((mid) => !memberPlantTypeIds.includes(mid));
      if (removedIds.length > 0) {
        await tx.plantType.updateMany({ where: { id: { in: removedIds } }, data: { variantGroupId: null } });
      }
      await tx.plantType.updateMany({ where: { id: { in: memberPlantTypeIds } }, data: { variantGroupId: id } });
    }
    return tx.plantVariantGroup.update({
      where: { id },
      data: { ...(name ? { name } : {}) },
      include: { members: { select: memberSelect, orderBy: { code: "asc" } } },
    });
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Thiếu id" }, { status: 400 });

  const group = await prisma.plantVariantGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm biến thể" }, { status: 404 });

  // Xoá nhóm KHÔNG xoá các mã cây thành viên — chỉ gỡ liên kết (variantGroupId tự về null qua relation
  // Prisma tự xử lý khi xoá group cha, nhưng gỡ tường minh trước để chắc chắn không phụ thuộc onDelete
  // mặc định của DB).
  await prisma.$transaction([
    prisma.plantType.updateMany({ where: { variantGroupId: id }, data: { variantGroupId: null } }),
    prisma.plantVariantGroup.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
