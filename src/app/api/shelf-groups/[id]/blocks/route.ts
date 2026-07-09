import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  roomId: z.string().min(1),
  blocks: z.array(z.string()).min(1, "Cần chọn ít nhất 1 block"),
  action: z.enum(["assign", "unassign"]),
});

// Gán/gỡ 1 hoặc nhiều block (trong CÙNG 1 phòng) vào/khỏi Nhóm — thao tác theo cả block (mọi kệ có
// cùng giá trị Shelf.block trong phòng đó), không phải theo từng kệ lẻ. Gán đè: nếu block đang thuộc
// Nhóm khác, gán vào Nhóm này sẽ chuyển hẳn sang (1 block chỉ thuộc 1 Nhóm tại 1 thời điểm).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { roomId, blocks, action } = parsed.data;

  const group = await prisma.shelfGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ message: "Không tìm thấy Nhóm" }, { status: 404 });

  if (action === "assign") {
    await prisma.shelf.updateMany({
      where: { roomId, block: { in: blocks } },
      data: { groupId: id },
    });
  } else {
    await prisma.shelf.updateMany({
      where: { roomId, block: { in: blocks }, groupId: id },
      data: { groupId: null },
    });
  }

  return NextResponse.json({ success: true });
}
