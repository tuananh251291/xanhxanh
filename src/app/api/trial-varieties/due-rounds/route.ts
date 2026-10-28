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
    // Lượt có chỉ định cấy R&D: recordedAt luôn null (kết quả nhập theo chỉ định) — chỉ nhắc khi chỉ định còn chạy.
    where: {
      recordedAt: null,
      expectedReadyAt: { lte: addDays(new Date(), 3) },
      OR: [{ instructionId: null }, { instruction: { status: { in: ["DRAFT", "ACTIVE"] } } }],
    },
    select: {
      id: true,
      motherInputQuantity: true,
      waitWeeks: true,
      plantedAt: true,
      expectedReadyAt: true,
      trialVariety: { select: { id: true, code: true, name: true } },
      // Lượt cấy có chỉ định cấy R&D (mỗi lượt = 1 chỉ định) — kết quả nhập theo chỉ định, không qua form lượt cấy.
      instructionId: true,
      // Người được giao lượt cấy (Admin kỹ thuật hoặc NV cấy mô — xem validateRndAssignee).
      instruction: { select: { assignedTo: { select: { id: true, code: true, name: true, role: true } }, _count: { select: { dailyRecords: true } } } },
    },
    orderBy: { expectedReadyAt: "asc" },
  });
  return NextResponse.json({ rounds });
}
