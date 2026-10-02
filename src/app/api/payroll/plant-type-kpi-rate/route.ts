import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll, KPI_RATE_STAGE_CODES } from "@/types";
import { z } from "zod";

// vndPerUnit null = xoá đơn giá quy cách đó (quy đổi 0đ).
const patchSchema = z.object({
  plantTypeId: z.string().min(1),
  rates: z.array(z.object({ stageCode: z.enum(KPI_RATE_STAGE_CODES), vndPerUnit: z.number().int().min(0).nullable() })).min(1),
});

// "Quy đổi sản lượng – KPI" — đơn giá VNĐ/đơn vị theo từng (mã cây + quy cách M05/T01/T05), dùng quy đổi
// sản lượng NV cấy mô bàn giao (đã được Kho mô xác nhận) sang giá trị VNĐ để so với Sản lượng chỉ tiêu
// (xem src/lib/payroll-calculation.ts). Nhập hàng loạt bằng Excel: xem ./import/route.ts.
export async function GET() {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const plantTypes = await prisma.plantType.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, kpiRates: { select: { stageCode: true, vndPerUnit: true } } },
    orderBy: { code: "asc" },
  });

  return NextResponse.json(
    plantTypes.map((p) => ({
      plantTypeId: p.id,
      plantTypeCode: p.code,
      plantTypeName: p.name,
      rates: Object.fromEntries(
        KPI_RATE_STAGE_CODES.map((sc) => [sc, p.kpiRates.find((r) => r.stageCode === sc)?.vndPerUnit ?? null])
      ),
    }))
  );
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { plantTypeId, rates } = parsed.data;

  const plantType = await prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { id: true } });
  if (!plantType) return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });

  await prisma.$transaction(
    rates.map(({ stageCode, vndPerUnit }) =>
      vndPerUnit == null
        ? prisma.plantTypeKpiRate.deleteMany({ where: { plantTypeId, stageCode } })
        : prisma.plantTypeKpiRate.upsert({
            where: { plantTypeId_stageCode: { plantTypeId, stageCode } },
            update: { vndPerUnit },
            create: { plantTypeId, stageCode, vndPerUnit },
          })
    )
  );
  return NextResponse.json({ ok: true });
}
