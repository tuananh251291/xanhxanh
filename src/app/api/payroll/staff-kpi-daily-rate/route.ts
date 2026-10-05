import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { format } from "date-fns";
import { z } from "zod";
import { computeAnnualWorkDays, computeKpiDailyRate } from "@/lib/kpi-daily-rate";

// Mức KPI công việc tối đa (VNĐ/tháng) riêng NV — null = bỏ (tính như 0).
const patchSchema = z.object({ staffId: z.string().min(1), workKpiMaxAmount: z.number().int().min(0).nullable() });

// "KPI của nhân viên" — KPI/ngày (VNĐ) TỰ TÍNH của từng NV cấy mô (không còn nhập tay, xem
// src/lib/kpi-daily-rate.ts), kèm các thành phần để đối chiếu. Chỉ "Mức KPI công việc tối đa" là nhập ở
// đây (PATCH, hoặc Excel ở /api/payroll/staff-kpi-max/import?kind=work). Năm tính mẫu số = ?year= (mặc định
// năm hiện tại). Lọc theo cơ sở sản xuất qua ?warehouseId=.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const warehouseId = req.nextUrl.searchParams.get("warehouseId")?.trim() || undefined;
  const yearParam = Number(req.nextUrl.searchParams.get("year"));
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : new Date().getFullYear();

  const [staffList, globalRate, annual] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CAY_MO", isActive: true, ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}) },
      select: {
        id: true, code: true, name: true, isTrainee: true,
        workplaceWarehouse: { select: { code: true, name: true } },
        staffBaseSalary: { select: { monthlyAmount: true, kpiBonusAmount: true, workKpiMaxAmount: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.kpiBonusRate.findFirst({ where: { periodMonth: { lte: format(new Date(), "yyyy-MM") } }, orderBy: { periodMonth: "desc" } }),
    computeAnnualWorkDays(year),
  ]);

  return NextResponse.json({
    annual,
    rows: staffList.map((s) => {
      const monthlyAmount = s.staffBaseSalary?.monthlyAmount ?? null;
      const complianceKpiMax = s.staffBaseSalary?.kpiBonusAmount ?? globalRate?.maxAmount ?? null;
      const workKpiMaxAmount = s.staffBaseSalary?.workKpiMaxAmount ?? null;
      return {
        staffId: s.id,
        staffCode: s.code,
        staffName: s.name,
        isTrainee: s.isTrainee,
        warehouseName: s.workplaceWarehouse?.name ?? null,
        monthlyAmount,
        complianceKpiMax,
        complianceKpiMaxIsOwn: s.staffBaseSalary?.kpiBonusAmount != null,
        workKpiMaxAmount,
        kpiDailyRate: computeKpiDailyRate(monthlyAmount, complianceKpiMax, workKpiMaxAmount, annual.workDays),
      };
    }),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { staffId, workKpiMaxAmount } = parsed.data;

  const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { role: true } });
  if (!staff || staff.role !== "CAY_MO") return NextResponse.json({ message: "Không tìm thấy NV cấy mô" }, { status: 400 });

  // Lương công việc là field bắt buộc — NV chưa từng cài thì tạo với 0, sửa sau ở tab Lương công việc.
  const updated = await prisma.staffBaseSalary.upsert({
    where: { staffId },
    update: { workKpiMaxAmount },
    create: { staffId, monthlyAmount: 0, workKpiMaxAmount },
  });
  return NextResponse.json(updated);
}
