import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteViolationPhotos } from "@/lib/violation-photo-storage";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { z } from "zod";

const patchSchema = z.object({ violationTypeId: z.string().min(1) });

// Sửa/xoá 1 lỗi vi phạm đã ghi nhận sai — chỉ SUPER_ADMIN/NV Hành chính nhân sự (vai trò quản lý dữ
// liệu lương, xem canManagePayroll) vì vi phạm ảnh hưởng trực tiếp tới điểm tuân thủ/lương. Đổi loại
// lỗi thì tính lại pointsApplied theo đúng loại mới (không giữ điểm cũ), giữ nguyên staffId/createdAt.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const existing = await prisma.violationRecord.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ message: "Không tìm thấy vi phạm" }, { status: 404 });

  const violationType = await prisma.violationType.findUnique({ where: { id: parsed.data.violationTypeId }, select: { points: true } });
  if (!violationType) return NextResponse.json({ message: "Không tìm thấy loại lỗi vi phạm" }, { status: 400 });

  // Sửa tay dùng thẳng điểm cơ bản của loại lỗi mới chọn (không tính lại "lần lặp lại thứ mấy trong kỳ"
  // — dòng đang sửa vốn đã tồn tại sẵn trong kỳ đó, không phải 1 lần ghi nhận mới).
  const updated = await prisma.violationRecord.update({
    where: { id },
    data: { violationTypeId: parsed.data.violationTypeId, pointsApplied: violationType.points },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await prisma.violationRecord.delete({ where: { id }, select: { photoUrls: true } });
  // Xoá luôn ảnh bằng chứng — trừ ảnh còn dùng chung với lỗi khác cùng lượt Kiểm tra kho tối.
  if (deleted.photoUrls.length > 0) {
    const stillUsed = await prisma.violationRecord.findMany({
      where: { photoUrls: { hasSome: deleted.photoUrls } },
      select: { photoUrls: true },
    });
    const used = new Set(stillUsed.flatMap((r) => r.photoUrls));
    await deleteViolationPhotos(deleted.photoUrls.filter((u) => !used.has(u))).catch((err) =>
      console.error("[violation-records] Không xoá được ảnh vi phạm:", err)
    );
  }
  return NextResponse.json({ ok: true });
}
