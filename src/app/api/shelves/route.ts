import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Tra cứu 1 giàn kệ theo mã (dùng khi quét QR code của kệ — QR chỉ mã hoá đúng shelf.code, xem
// components/shared/qr-code-display.tsx). Trả về kèm lô thành phẩm đang active để trang "Bàn giao
// thành phẩm" tổng hợp số lượng theo loại cây — không tự chặn theo loại phòng ở đây, để UI tự quyết
// định thông báo lỗi phù hợp (VD: "kệ này không thuộc Phòng ra rễ").
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ message: "Thiếu mã giàn kệ" }, { status: 400 });

  const shelf = await prisma.shelf.findUnique({
    where: { code },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      room: { select: { id: true, type: true, name: true } },
      lots: {
        where: { status: "ACTIVE", stage: "THANH_PHAM" },
        select: { id: true, code: true, quantity: true, stageCode: true, plantType: { select: { id: true, code: true, name: true } } },
      },
    },
  });
  if (!shelf) return NextResponse.json({ message: `Không tìm thấy giàn kệ có mã "${code}"` }, { status: 404 });

  return NextResponse.json(shelf);
}
