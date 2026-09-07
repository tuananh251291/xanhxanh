import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { addDays } from "date-fns";

// Nhiệm vụ "đến hạn cấy" — dùng chung cho cả thẻ nhiệm vụ ở Dashboard (Admin kỹ thuật) lẫn tab "Cập nhật
// tiến độ sản xuất" trong R&D. Hiện TỪ 3 NGÀY TRƯỚC hạn (expectedReadyAt <= hôm nay + 3) cho tới khi
// CHƯA nhập kết quả (recordedAt null) — không chỉ khi đã tới/quá hạn như trước, để Admin kỹ thuật chủ
// động sắp xếp trước thay vì bị động lúc đúng ngày.
export async function GET() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const rounds = await prisma.trialCultivationRound.findMany({
    where: { recordedAt: null, expectedReadyAt: { lte: addDays(new Date(), 3) } },
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
