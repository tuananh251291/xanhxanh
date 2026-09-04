import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { generateTrialVarietyCode } from "@/lib/codes";
import { uploadTrialVarietyPhoto } from "@/lib/trial-variety-storage";
import { z } from "zod";

// "Quản lý giống mới" (R&D, /rnd) — danh sách giống thử nghiệm kèm tổng số đợt ảnh/lượt cấy + lượt gần
// nhất, để hiện bảng tổng quan. TÁCH HOÀN TOÀN khỏi PlantType/Lot thật — xem comment đầu khối model
// TrialVariety trong schema.prisma.
export async function GET() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const varieties = await prisma.trialVariety.findMany({
    select: {
      id: true, code: true, name: true, plantGroup: true, createdAt: true,
      _count: { select: { photos: true, rounds: true } },
      rounds: { orderBy: { createdAt: "desc" }, take: 1, select: { expectedReadyAt: true, outputQuantity: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    varieties: varieties.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      plantGroup: v.plantGroup,
      createdAt: v.createdAt,
      photoCount: v._count.photos,
      roundCount: v._count.rounds,
      latestRound: v.rounds[0] ?? null,
    })),
  });
}

const MAX_DATA_URL_LENGTH = 3_000_000;
const photoField = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Ảnh không hợp lệ")
  .refine((v) => v.length <= MAX_DATA_URL_LENGTH, "Ảnh quá lớn, vui lòng chụp lại");

const createSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên cây"),
  plantGroup: z.string().trim().min(1, "Nhập loại cây"),
  description: z.string().trim().optional(),
  origin: z.string().trim().optional(),
  photo1: photoField,
  photo2: photoField.optional(),
});

// Tạo giống mới — sinh mã tự động (generateTrialVarietyCode, "TN999" giảm dần) + 2 ảnh ban đầu (photo2
// tuỳ chọn) ghi luôn thành đợt ảnh ĐẦU TIÊN của giống (TrialVarietyPhoto) — trang chi tiết chỉ cần đọc
// photos, không cần phân biệt "ảnh lúc tạo" với "ảnh cập nhật sau".
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { name, plantGroup, description, origin, photo1, photo2 } = parsed.data;

  try {
    const code = await generateTrialVarietyCode();
    const basePath = `${code}/${Date.now()}`;
    const photoUrl1 = await uploadTrialVarietyPhoto(photo1, `${basePath}-1`);
    const photoUrl2 = photo2 ? await uploadTrialVarietyPhoto(photo2, `${basePath}-2`) : null;

    const variety = await prisma.trialVariety.create({
      data: {
        code,
        name,
        plantGroup,
        description: description || null,
        origin: origin || null,
        createdById: session!.user!.id,
        photos: { create: { photoUrl1, photoUrl2, uploadedById: session!.user!.id } },
      },
      select: { id: true, code: true },
    });
    return NextResponse.json(variety, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tạo giống mới thất bại";
    return NextResponse.json({ message }, { status: 500 });
  }
}
