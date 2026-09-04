import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { uploadTrialVarietyPhoto } from "@/lib/trial-variety-storage";
import { z } from "zod";

const MAX_DATA_URL_LENGTH = 3_000_000;
const photoField = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Ảnh không hợp lệ")
  .refine((v) => v.length <= MAX_DATA_URL_LENGTH, "Ảnh quá lớn, vui lòng chụp lại");

const addPhotoSchema = z.object({
  photo1: photoField,
  photo2: photoField.optional(),
  note: z.string().trim().optional(),
});

// Thêm 1 đợt cập nhật ảnh mới cho giống — không giới hạn số đợt, mỗi đợt tự có mốc createdAt riêng để
// xem tiến trình phát triển theo thời gian (xem "Danh sách giống mới" ở /rnd).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const variety = await prisma.trialVariety.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!variety) return NextResponse.json({ message: "Không tìm thấy giống" }, { status: 404 });

  const body = await req.json();
  const parsed = addPhotoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  try {
    const basePath = `${variety.code}/${Date.now()}`;
    const photoUrl1 = await uploadTrialVarietyPhoto(parsed.data.photo1, `${basePath}-1`);
    const photoUrl2 = parsed.data.photo2 ? await uploadTrialVarietyPhoto(parsed.data.photo2, `${basePath}-2`) : null;

    const photo = await prisma.trialVarietyPhoto.create({
      data: {
        trialVarietyId: id,
        photoUrl1,
        photoUrl2,
        note: parsed.data.note || null,
        uploadedById: session!.user!.id,
      },
      select: { id: true, photoUrl1: true, photoUrl2: true, createdAt: true },
    });
    return NextResponse.json(photo, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tải ảnh lên thất bại";
    return NextResponse.json({ message }, { status: 500 });
  }
}
