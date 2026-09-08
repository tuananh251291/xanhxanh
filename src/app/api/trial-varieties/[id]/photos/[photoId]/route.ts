import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { deleteTrialVarietyPhoto } from "@/lib/trial-variety-storage";

// Xoá 1 đợt ảnh đã lưu (cả đợt tạo giống lẫn đợt "Cập nhật ảnh" sau đó — đều cùng 1 bảng
// TrialVarietyPhoto, xem variety-detail-board.tsx) — dọn luôn file thật trong Supabase Storage để tiết
// kiệm dung lượng, không chỉ xoá bản ghi DB. Không chặn nếu đây là đợt ảnh duy nhất của giống — giống thử
// nghiệm vẫn tồn tại bình thường dù tạm thời không còn ảnh nào.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id, photoId } = await params;
  const photo = await prisma.trialVarietyPhoto.findUnique({
    where: { id: photoId },
    select: { id: true, trialVarietyId: true, photoUrl1: true, photoUrl2: true },
  });
  if (!photo || photo.trialVarietyId !== id) {
    return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });
  }

  await prisma.trialVarietyPhoto.delete({ where: { id: photoId } });

  await Promise.all([
    deleteTrialVarietyPhoto(photo.photoUrl1),
    photo.photoUrl2 ? deleteTrialVarietyPhoto(photo.photoUrl2) : Promise.resolve(),
  ]).catch(() => {});

  return NextResponse.json({ success: true });
}
