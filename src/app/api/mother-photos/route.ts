import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { uploadMotherPhoto } from "@/lib/mother-photo-storage";
import { startOfWeek, addWeeks, addDays, startOfDay } from "date-fns";
import { toStoredWeekStart, getCalendarWeekNumber } from "@/lib/week-rotation";
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
        mediumRole: true,
        imageUrl: true,
        createdAt: true,
        takenBy: { select: { name: true } },
        lot: { select: { enteredAt: true } },
      },
      orderBy: [{ weekIndex: "asc" }, { mediumRole: "asc" }],
    });
    return NextResponse.json({
      photos: photos.map(({ lot, ...p }) => ({
        ...p,
        // Tuần thật của ảnh này = tuần nhập kho sáng + weekIndex (xem getCalendarWeekNumber).
        realWeek: getCalendarWeekNumber(lot.enteredAt) + p.weekIndex,
      })),
    });
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
    const byLot = new Map<string, { lotId: string; lotCode: string; enteredAt: Date; enteredWeek: number; coverImageUrl: string; photoCount: number }>();
    for (const p of photos) {
      const entry = byLot.get(p.lot.id);
      if (entry) entry.photoCount += 1;
      else byLot.set(p.lot.id, {
        lotId: p.lot.id,
        lotCode: p.lot.code,
        enteredAt: p.lot.enteredAt,
        enteredWeek: getCalendarWeekNumber(p.lot.enteredAt),
        coverImageUrl: p.imageUrl,
        photoCount: 1,
      });
    }
    return NextResponse.json({ lots: Array.from(byLot.values()) });
  }

  return NextResponse.json({ message: "Thiếu plantTypeId hoặc lotId" }, { status: 400 });
}

const createSchema = z.object({
  lotId: z.string().min(1),
  shelfId: z.string().min(1),
  // 0 = tuần nhập kho sáng (chụp luôn tuần lên kho, không phải tuần sau) — xem WeekButtonRow trong
  // mother-photo-update-board.tsx.
  weekIndex: z.number().int().min(0),
  // Chỉ có giá trị khi chỉ định cấy của lô này cấu hình 2 môi trường mẫu mẹ — thuần nhãn để NV phân
  // biệt túi lúc chụp, không tách số liệu thật (xem comment MotherPhoto.mediumRole).
  mediumRole: z.enum(["MOTHER", "PRE_ROOTING"]).nullable().optional(),
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

  const lot = await prisma.lot.findUnique({ where: { id: parsed.data.lotId }, select: { id: true, plantTypeId: true, enteredAt: true } });
  if (!lot) return NextResponse.json({ message: "Không tìm thấy lô" }, { status: 404 });

  // Khoá tuần đã trôi qua ở phía server (không chỉ ẩn nút phía client) — chặn cả trường hợp gọi thẳng
  // API, dùng đúng công thức weekDateRange ở mother-photo-update-board.tsx: Chủ nhật của tuần
  // enteredWeek + weekIndex đã qua thì không cho chụp bù nữa, không còn ý nghĩa so sánh theo tuần thực tế.
  const now = new Date();
  const weekMonday = addWeeks(startOfWeek(lot.enteredAt, { weekStartsOn: 1 }), parsed.data.weekIndex);
  const weekSunday = addDays(weekMonday, 6);
  if (weekSunday < startOfDay(now)) {
    return NextResponse.json({ message: "Tuần này đã quá hạn, không thể chụp bù" }, { status: 400 });
  }

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
        mediumRole: parsed.data.mediumRole ?? null,
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
