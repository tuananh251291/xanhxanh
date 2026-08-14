import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { uploadMotherPhoto } from "@/lib/mother-photo-storage";
import { startOfWeek } from "date-fns";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { z } from "zod";

// GET ?plantTypeId=... — trang "Xem dữ liệu hình ảnh": danh sách lô có ảnh của 1 loại cây, theo ngày
// nhập kho sáng (Lot.enteredAt — bị commitShelfPlacements ghi đè thành ngày lên kệ kho sáng, xem
// prisma/schema.prisma).
// GET ?lotId=... — toàn bộ ảnh của 1 lô, sắp theo weekIndex để hiện cạnh nhau so sánh.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KY_THUAT" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const plantTypeId = searchParams.get("plantTypeId");
  const lotId = searchParams.get("lotId");

  if (lotId) {
    const photos = await prisma.motherPhoto.findMany({
      where: { lotId },
      select: {
        id: true,
        weekIndex: true,
        imageUrl: true,
        createdAt: true,
        takenBy: { select: { name: true } },
      },
      orderBy: { weekIndex: "asc" },
    });
    return NextResponse.json({ photos });
  }

  if (plantTypeId) {
    const photos = await prisma.motherPhoto.findMany({
      where: { plantTypeId },
      select: {
        imageUrl: true,
        lot: { select: { id: true, code: true, enteredAt: true } },
      },
      orderBy: { lot: { enteredAt: "desc" } },
    });
    const byLot = new Map<string, { lotId: string; lotCode: string; enteredAt: Date; coverImageUrl: string; photoCount: number }>();
    for (const p of photos) {
      const entry = byLot.get(p.lot.id);
      if (entry) entry.photoCount += 1;
      else byLot.set(p.lot.id, { lotId: p.lot.id, lotCode: p.lot.code, enteredAt: p.lot.enteredAt, coverImageUrl: p.imageUrl, photoCount: 1 });
    }
    return NextResponse.json({ lots: Array.from(byLot.values()) });
  }

  return NextResponse.json({ message: "Thiếu plantTypeId hoặc lotId" }, { status: 400 });
}

const createSchema = z.object({
  lotId: z.string().min(1),
  shelfId: z.string().min(1),
  weekIndex: z.number().int().positive(),
  image: z.string().regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Ảnh không hợp lệ"),
});

const MAX_DATA_URL_LENGTH = 3_000_000;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Chỉ NV Kỹ thuật mới được chụp ảnh mẫu mẹ" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  if (parsed.data.image.length > MAX_DATA_URL_LENGTH) {
    return NextResponse.json({ message: "Ảnh quá lớn, vui lòng chụp lại" }, { status: 400 });
  }

  const lot = await prisma.lot.findUnique({ where: { id: parsed.data.lotId }, select: { id: true, plantTypeId: true } });
  if (!lot) return NextResponse.json({ message: "Không tìm thấy lô" }, { status: 404 });

  const now = new Date();
  const weekStart = toStoredWeekStart(startOfWeek(now, { weekStartsOn: 1 }));

  try {
    const imageUrl = await uploadMotherPhoto(
      parsed.data.image,
      `${lot.plantTypeId}/${parsed.data.lotId}/${Date.now()}-${session.user.id}`
    );
    const photo = await prisma.motherPhoto.create({
      data: {
        lotId: parsed.data.lotId,
        plantTypeId: lot.plantTypeId,
        shelfId: parsed.data.shelfId,
        weekIndex: parsed.data.weekIndex,
        weekStart,
        imageUrl,
        takenById: session.user.id,
      },
      select: { id: true, imageUrl: true, weekIndex: true, createdAt: true },
    });
    return NextResponse.json(photo, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tải ảnh lên thất bại";
    return NextResponse.json({ message }, { status: 500 });
  }
}
