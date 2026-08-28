import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPageAllowed } from "@/lib/permissions";
import { startOfWeek, endOfWeek } from "date-fns";

const STAGE_CODES = ["M05", "T05", "T01"] as const;

// Báo cáo "nhiễm sau ủ tối" theo TUẦN — danh sách chỉ định cấy, số lượng nhiễm theo từng quy cách
// (M05/T05/T01), % nhiễm trên tổng số lượng nhập kho tối. Dữ liệu lấy từ LotInspection/LotInspectionItem
// (xem /api/lot-inspections) — đúng bước NV cấy mô TỰ kiểm tra ngay sau khi lô đủ ngày ủ tối, KHÁC với
// luồng Đỏ (Kho mô kiểm tra lại lúc nhận bàn giao, xem dark-room-contamination-report.tsx/reports tab).
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Nhúng ở cả "Thống kê trực quan" của KY_THUAT (/reports/overview) lẫn trang báo cáo tỉ lệ nhiễm của
  // KHO_MO (/reports/mother-contamination) — cho phép nếu 1 trong 2 trang đó bật với vai trò đang gọi.
  const allowed =
    (await isPageAllowed(role, "/reports/overview")) || (await isPageAllowed(role, "/reports/mother-contamination"));
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const weekStartParam = searchParams.get("weekStart");
  const staffId = searchParams.get("staffId");
  const anchor = weekStartParam ? new Date(weekStartParam) : new Date();
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });

  const items = await prisma.lotInspectionItem.findMany({
    where: {
      inspection: { createdAt: { gte: weekStart, lte: weekEnd } },
      ...(staffId ? { lot: { instruction: { assignedToId: staffId } } } : {}),
    },
    select: {
      stageCode: true,
      initialQuantity: true,
      contaminatedQuantity: true,
      lot: {
        select: {
          instructionId: true,
          instruction: {
            select: {
              code: true,
              plantType: { select: { code: true, name: true } },
              assignedTo: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  type Row = {
    key: string;
    instructionCode: string;
    plantTypeCode: string | null;
    plantTypeName: string | null;
    staffName: string | null;
    contaminatedByStage: Record<string, number>;
    initialTotal: number;
    contaminatedTotal: number;
  };

  const byInstruction = new Map<string, Row>();
  for (const item of items) {
    const key = item.lot.instructionId ?? "__NO_INSTRUCTION__";
    let row = byInstruction.get(key);
    if (!row) {
      row = {
        key,
        instructionCode: item.lot.instruction?.code ?? "— (không có chỉ định)",
        plantTypeCode: item.lot.instruction?.plantType.code ?? null,
        plantTypeName: item.lot.instruction?.plantType.name ?? null,
        staffName: item.lot.instruction?.assignedTo?.name ?? null,
        contaminatedByStage: Object.fromEntries(STAGE_CODES.map((c) => [c, 0])),
        initialTotal: 0,
        contaminatedTotal: 0,
      };
      byInstruction.set(key, row);
    }
    row.contaminatedByStage[item.stageCode] = (row.contaminatedByStage[item.stageCode] ?? 0) + item.contaminatedQuantity;
    row.initialTotal += item.initialQuantity;
    row.contaminatedTotal += item.contaminatedQuantity;
  }

  const rows = Array.from(byInstruction.values())
    .map((r) => ({
      ...r,
      contaminationRatePct: r.initialTotal > 0 ? Math.round((r.contaminatedTotal / r.initialTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.contaminationRatePct - a.contaminationRatePct);

  const summaryInitialTotal = rows.reduce((sum, r) => sum + r.initialTotal, 0);
  const summaryContaminatedTotal = rows.reduce((sum, r) => sum + r.contaminatedTotal, 0);

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    rows,
    summary: {
      initialTotal: summaryInitialTotal,
      contaminatedTotal: summaryContaminatedTotal,
      ratePct: summaryInitialTotal > 0 ? Math.round((summaryContaminatedTotal / summaryInitialTotal) * 1000) / 10 : 0,
    },
  });
}
