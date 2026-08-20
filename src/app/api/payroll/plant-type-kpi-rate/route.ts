import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { z } from "zod";

const patchSchema = z.object({ plantTypeId: z.string().min(1), vndPerUnit: z.number().int().min(0) });

// "Quy đổi sản lượng – KPI" — đơn giá VNĐ/đơn vị theo từng mã cây, dùng quy đổi sản lượng NV cấy mô bàn
// giao (đã được Kho mô xác nhận) sang giá trị VNĐ để so với Sản lượng chỉ tiêu (xem
// src/lib/payroll-calculation.ts).
export async function GET() {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const plantTypes = await prisma.plantType.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, kpiRate: { select: { vndPerUnit: true, updatedAt: true } } },
    orderBy: { code: "asc" },
  });

  return NextResponse.json(
    plantTypes.map((p) => ({
      plantTypeId: p.id,
      plantTypeCode: p.code,
      plantTypeName: p.name,
      vndPerUnit: p.kpiRate?.vndPerUnit ?? null,
      updatedAt: p.kpiRate?.updatedAt ?? null,
    }))
  );
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const plantType = await prisma.plantType.findUnique({ where: { id: parsed.data.plantTypeId }, select: { id: true } });
  if (!plantType) return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });

  const updated = await prisma.plantTypeKpiRate.upsert({
    where: { plantTypeId: parsed.data.plantTypeId },
    update: { vndPerUnit: parsed.data.vndPerUnit },
    create: { plantTypeId: parsed.data.plantTypeId, vndPerUnit: parsed.data.vndPerUnit },
  });
  return NextResponse.json(updated);
}
