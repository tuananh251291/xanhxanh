import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfMonth, endOfMonth, parse, isValid } from "date-fns";
import type { Prisma } from "@prisma/client";

const MAX_ROWS = 300;

// Báo cáo "Dữ liệu chỉ định cấy" (tab Báo cáo của Admin/Admin cấp cao + NV Kỹ thuật) — so sánh, theo TỪNG
// chỉ định, số kỳ vọng KY_THUAT đã tính lúc tạo chỉ định (PlantingInstruction.expectedMotherOutput/
// expectedFinishedOutput, xem POST /api/instructions) với số thực tế NV cấy mô đã nhập nhật ký cấy
// (DailyRecordItem.quantityCreated, gộp mọi DailyRecord của chỉ định đó bất kể ngày cấy — cùng công thức
// đang dùng ở trang chi tiết chỉ định src/app/(dashboard)/instructions/[id]/page.tsx).
// Query params: warehouseId ("ALL"/bỏ trống = mọi khu — lọc qua items.some.shelf.warehouseId vì
// PlantingInstruction không có FK kho trực tiếp), plantTypeId ("ALL"/bỏ trống = mọi loại), period=all|month
// (mặc định "all" = toàn bộ thời gian, không lọc ngày), month (yyyy-MM, dùng khi period=month — lọc theo
// PlantingInstruction.createdAt vì đây là field ngày tháng duy nhất luôn có giá trị, weekStart có thể
// null), instructionId (tuỳ chọn — chọn đúng 1 chỉ định từ ô tìm kiếm mã chỉ định ở FE).
// codeOptions trả về tính theo warehouseId/plantTypeId/period NHƯNG bỏ qua instructionId (giống
// availablePlantTypes ở planting-log-summary/route.ts) để ô tìm kiếm luôn giữ đủ danh sách gợi ý.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId") || null;
  const plantTypeId = searchParams.get("plantTypeId") || null;
  const period = searchParams.get("period") === "month" ? "month" : "all";
  const monthParam = searchParams.get("month");
  const instructionId = searchParams.get("instructionId") || null;

  let dateWhere: Prisma.PlantingInstructionWhereInput = {};
  if (period === "month" && monthParam) {
    const parsed = parse(monthParam, "yyyy-MM", new Date());
    if (isValid(parsed)) dateWhere = { createdAt: { gte: startOfMonth(parsed), lte: endOfMonth(parsed) } };
  }

  const baseWhere: Prisma.PlantingInstructionWhereInput = {
    ...(plantTypeId && plantTypeId !== "ALL" ? { plantTypeId } : {}),
    ...(warehouseId && warehouseId !== "ALL" ? { items: { some: { shelf: { warehouseId } } } } : {}),
    ...dateWhere,
  };

  const [instructions, codeOptionRows] = await Promise.all([
    prisma.plantingInstruction.findMany({
      where: { ...baseWhere, ...(instructionId ? { id: instructionId } : {}) },
      select: {
        id: true,
        code: true,
        createdAt: true,
        inputMotherQuantity: true,
        expectedMotherOutput: true,
        expectedFinishedOutput: true,
        plantType: { select: { code: true, name: true } },
        assignedTo: { select: { code: true, name: true } },
        items: { select: { shelf: { select: { warehouse: { select: { code: true, name: true } } } } }, take: 1 },
        dailyRecords: { select: { items: { select: { stage: true, quantityCreated: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    }),
    prisma.plantingInstruction.findMany({
      where: baseWhere,
      select: { id: true, code: true, plantType: { select: { code: true } } },
      orderBy: { code: "desc" },
      take: 500,
    }),
  ]);

  const rows = instructions.map((inst) => {
    let actualMotherOutput = 0;
    let actualFinishedOutput = 0;
    for (const rec of inst.dailyRecords) {
      for (const item of rec.items) {
        if (item.stage === "MAU_ME") actualMotherOutput += item.quantityCreated;
        else actualFinishedOutput += item.quantityCreated;
      }
    }
    const warehouse = inst.items[0]?.shelf?.warehouse ?? null;
    return {
      id: inst.id,
      code: inst.code,
      createdAt: inst.createdAt,
      plantType: inst.plantType,
      assignedTo: inst.assignedTo,
      warehouseLabel: warehouse ? `${warehouse.code} — ${warehouse.name}` : null,
      inputMotherQuantity: inst.inputMotherQuantity,
      expectedMotherOutput: inst.expectedMotherOutput,
      expectedFinishedOutput: inst.expectedFinishedOutput,
      actualMotherOutput,
      actualFinishedOutput,
    };
  });

  const totals = rows.reduce(
    (s, r) => ({
      inputMotherQuantity: s.inputMotherQuantity + r.inputMotherQuantity,
      expectedMotherOutput: s.expectedMotherOutput + (r.expectedMotherOutput ?? 0),
      expectedFinishedOutput: s.expectedFinishedOutput + (r.expectedFinishedOutput ?? 0),
      actualMotherOutput: s.actualMotherOutput + r.actualMotherOutput,
      actualFinishedOutput: s.actualFinishedOutput + r.actualFinishedOutput,
    }),
    { inputMotherQuantity: 0, expectedMotherOutput: 0, expectedFinishedOutput: 0, actualMotherOutput: 0, actualFinishedOutput: 0 }
  );

  const codeOptions = codeOptionRows.map((r) => ({ id: r.id, code: r.code, plantTypeCode: r.plantType.code }));

  return NextResponse.json({ rows, totals, codeOptions, truncated: instructions.length >= MAX_ROWS });
}
