import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPageAllowed } from "@/lib/permissions";
import { startOfDay, endOfDay, subDays, parseISO, isValid } from "date-fns";

// Báo cáo "Tỉ lệ nhiễm mẫu mẹ bàn giao" — nhiễm mẫu mẹ ĐẦU VÀO phát hiện lúc NV cấy mô kiểm tra hàng
// ngày (DailyRecord.motherContaminatedM05), cộng dồn theo CẢ chỉ định (không có breakdown theo ngày —
// con số chỉ "chốt" đúng nghĩa khi biết tổng cả tuần, xem cay-mo-quest-stats.ts/daily-records/route.ts
// dùng chung công thức inputMotherQuantity làm mẫu số). Lọc theo weekStart của chỉ định nằm trong
// khoảng ngày chọn — mỗi chỉ định luôn đúng 1 tuần.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Báo cáo này được nhúng ở cả tab "Tỉ lệ nhiễm" của Admin (/reports) lẫn "Thống kê trực quan" của
  // KY_THUAT (/reports/overview) — cho phép nếu 1 trong 2 trang đó bật với vai trò đang gọi.
  const allowed = (await isPageAllowed(role, "/reports")) || (await isPageAllowed(role, "/reports/overview"));
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staffId") || undefined;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const parsedFrom = fromParam ? parseISO(fromParam) : null;
  const parsedTo = toParam ? parseISO(toParam) : null;
  const from = parsedFrom && isValid(parsedFrom) ? startOfDay(parsedFrom) : startOfDay(subDays(new Date(), 30));
  const to = parsedTo && isValid(parsedTo) ? endOfDay(parsedTo) : endOfDay(new Date());

  const instructions = await prisma.plantingInstruction.findMany({
    where: {
      weekStart: { gte: from, lte: to },
      ...(staffId ? { assignedToId: staffId } : {}),
    },
    select: {
      id: true,
      code: true,
      status: true,
      weekStart: true,
      inputMotherQuantity: true,
      assignedTo: { select: { id: true, name: true, code: true } },
      dailyRecords: { select: { motherChecked: true, motherContaminatedM05: true } },
    },
    orderBy: { weekStart: "desc" },
  });

  const rows = instructions.map((inst) => {
    const totalChecked = inst.dailyRecords.reduce((s, r) => s + r.motherChecked, 0);
    const totalContaminated = inst.dailyRecords.reduce((s, r) => s + r.motherContaminatedM05, 0);
    const ratePct = inst.inputMotherQuantity > 0 ? (totalContaminated / inst.inputMotherQuantity) * 100 : 0;
    return {
      instructionId: inst.id,
      code: inst.code,
      status: inst.status,
      weekStart: inst.weekStart,
      staffId: inst.assignedTo?.id ?? null,
      staffName: inst.assignedTo?.name ?? null,
      staffCode: inst.assignedTo?.code ?? null,
      inputMotherQuantity: inst.inputMotherQuantity,
      totalChecked,
      totalContaminated,
      ratePct: Math.round(ratePct * 10) / 10,
    };
  });

  const totalContaminated = rows.reduce((s, r) => s + r.totalContaminated, 0);
  const totalInput = rows.reduce((s, r) => s + r.inputMotherQuantity, 0);
  const overallRatePct = totalInput > 0 ? Math.round((totalContaminated / totalInput) * 1000) / 10 : 0;

  return NextResponse.json({
    rows,
    summary: { totalContaminated, totalInput, overallRatePct, instructionCount: rows.length },
  });
}
