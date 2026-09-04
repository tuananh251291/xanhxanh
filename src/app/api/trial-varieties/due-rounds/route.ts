import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";

// "Cập nhật tiến độ sản xuất" (R&D, /rnd) — mọi lượt cấy đã tới hoặc quá hạn (expectedReadyAt <= hôm
// nay) mà CHƯA nhập kết quả (outputQuantity null) — hiện như gợi ý nhiệm vụ ngày trên trang Admin kỹ
// thuật, y hệt ý nghĩa "đến tuổi cấy" của NV cấy mô nhưng tính theo waitWeeks Admin tự nhập từng lượt.
export async function GET() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const rounds = await prisma.trialCultivationRound.findMany({
    where: { outputQuantity: null, expectedReadyAt: { lte: new Date() } },
    select: {
      id: true,
      motherInputQuantity: true,
      waitWeeks: true,
      plantedAt: true,
      expectedReadyAt: true,
      trialVariety: { select: { id: true, code: true, name: true } },
    },
    orderBy: { expectedReadyAt: "asc" },
  });
  return NextResponse.json({ rounds });
}
