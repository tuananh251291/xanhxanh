import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { z } from "zod";

const patchSchema = z.object({ staffId: z.string().min(1), vndPerDay: z.number().int().min(0) });

// "KPI của nhân viên" — KPI/ngày (VNĐ) của từng NV cấy mô, dùng tính Sản lượng chỉ tiêu (xem
// src/lib/payroll-calculation.ts). Lọc theo cơ sở sản xuất qua ?warehouseId=.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const warehouseId = req.nextUrl.searchParams.get("warehouseId")?.trim() || undefined;

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true, ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}) },
    select: {
      id: true, code: true, name: true,
      workplaceWarehouse: { select: { code: true, name: true } },
      staffKpiDailyRate: { select: { vndPerDay: true, updatedAt: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    staffList.map((s) => ({
      staffId: s.id,
      staffCode: s.code,
      staffName: s.name,
      warehouseName: s.workplaceWarehouse?.name ?? null,
      vndPerDay: s.staffKpiDailyRate?.vndPerDay ?? null,
      updatedAt: s.staffKpiDailyRate?.updatedAt ?? null,
    }))
  );
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const staff = await prisma.user.findUnique({ where: { id: parsed.data.staffId }, select: { role: true } });
  if (!staff || staff.role !== "CAY_MO") return NextResponse.json({ message: "Không tìm thấy NV cấy mô" }, { status: 400 });

  const updated = await prisma.staffKpiDailyRate.upsert({
    where: { staffId: parsed.data.staffId },
    update: { vndPerDay: parsed.data.vndPerDay },
    create: { staffId: parsed.data.staffId, vndPerDay: parsed.data.vndPerDay },
  });
  return NextResponse.json(updated);
}
