import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  shelfIds: z.array(z.string()).min(1, "Cần chọn ít nhất 1 kệ"),
  action: z.enum(["assign", "unassign"]),
});

// Gán/gỡ 1 hoặc nhiều kệ lẻ vào/khỏi Nhóm — theo từng kệ, không còn ràng buộc phải cùng 1 block
// (VD có thể gộp A1C10 và B1C09 vào cùng 1 Nhóm dù khác block). Gán đè: nếu kệ đang thuộc Nhóm khác,
// gán vào Nhóm này sẽ chuyển hẳn sang (1 kệ chỉ thuộc 1 Nhóm tại 1 thời điểm).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { shelfIds, action } = parsed.data;

  const group = await prisma.shelfGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ message: "Không tìm thấy Nhóm" }, { status: 404 });

  if (action === "assign") {
    await prisma.shelf.updateMany({
      where: { id: { in: shelfIds } },
      data: { groupId: id },
    });
  } else {
    await prisma.shelf.updateMany({
      where: { id: { in: shelfIds }, groupId: id },
      data: { groupId: null },
    });
  }

  return NextResponse.json({ success: true });
}
