import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";

// Chi tiết 1 giống thử nghiệm — toàn bộ lịch sử ảnh (mọi đợt, kể cả 2 ảnh lúc tạo) + toàn bộ lượt cấy,
// mới nhất trước, dùng cho trang /rnd/[id].
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const variety = await prisma.trialVariety.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      plantGroup: true,
      description: true,
      origin: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      photos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, photoUrl1: true, photoUrl2: true, note: true, createdAt: true, uploadedBy: { select: { name: true } } },
      },
      rounds: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, motherInputQuantity: true, waitWeeks: true, plantedAt: true, expectedReadyAt: true,
          outputQuantity: true, recordedAt: true, notes: true,
        },
      },
    },
  });
  if (!variety) return NextResponse.json({ message: "Không tìm thấy giống" }, { status: 404 });
  return NextResponse.json(variety);
}
