import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { z } from "zod";

const patchSchema = z.object({
  staffId: z.string().min(1),
  monthlyAmount: z.number().int().min(0).optional(),
  kpiBonusAmount: z.number().int().min(0).optional(),
}).refine((d) => d.monthlyAmount !== undefined || d.kpiBonusAmount !== undefined, { message: "Cần nhập ít nhất 1 giá trị" });

// "Lương công việc theo NV" — mức lương thoả thuận/tháng (VNĐ) của từng NV cấy mô, dùng tính lương (xem
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
      staffBaseSalary: { select: { monthlyAmount: true, kpiBonusAmount: true, updatedAt: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    staffList.map((s) => ({
      staffId: s.id,
      staffCode: s.code,
      staffName: s.name,
      warehouseName: s.workplaceWarehouse?.name ?? null,
      monthlyAmount: s.staffBaseSalary?.monthlyAmount ?? null,
      kpiBonusAmount: s.staffBaseSalary?.kpiBonusAmount ?? null,
      updatedAt: s.staffBaseSalary?.updatedAt ?? null,
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

  const { staffId, monthlyAmount, kpiBonusAmount } = parsed.data;
  const updated = await prisma.staffBaseSalary.upsert({
    where: { staffId },
    update: {
      ...(monthlyAmount !== undefined ? { monthlyAmount } : {}),
      ...(kpiBonusAmount !== undefined ? { kpiBonusAmount } : {}),
    },
    // monthlyAmount là field bắt buộc (Int, không null) — HR nhập Thưởng KPI trước khi từng cài Lương
    // công việc thì mặc định 0, sửa lại bình thường ở cột Lương công việc sau.
    create: { staffId, monthlyAmount: monthlyAmount ?? 0, kpiBonusAmount },
  });
  return NextResponse.json(updated);
}
