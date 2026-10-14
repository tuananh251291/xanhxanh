import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { snapshotFinishedStock } from "@/lib/stock-count";
import { canEditStockCount, canViewStockCount, summarizeStockCount } from "@/lib/stock-count-shared";

export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (!canViewStockCount(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  // Quản lý kho chỉ thấy báo cáo kho mình đang làm việc; Trợ lý/Admin cấp cao/HCNS thấy mọi kho.
  const warehouseFilter = canEditStockCount(role) ? { warehouseId: session!.user.workplaceWarehouseId ?? "__none__" } : {};
  const reports = await prisma.stockCountReport.findMany({
    where: { ...warehouseFilter, ...(canEditStockCount(role) ? {} : { status: { not: "DRAFT" as const } }) },
    include: {
      warehouse: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      items: { select: { systemQuantity: true, actualQuantity: true } },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return NextResponse.json(
    reports.map(({ items, ...r }) => ({ ...r, summary: summarizeStockCount(items) }))
  );
}

const createSchema = z.object({
  year: z.number().int().min(2024).max(2100),
  month: z.number().int().min(1).max(12),
  countDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Chọn ngày kiểm kê"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canEditStockCount(session.user.role)) {
    return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm được lập báo cáo đối chiếu" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Tài khoản chưa được gán kho làm việc" }, { status: 400 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { year, month, countDate } = parsed.data;

  const existing = await prisma.stockCountReport.findUnique({ where: { warehouseId_year_month: { warehouseId, year, month } }, select: { id: true } });
  if (existing) return NextResponse.json({ message: `Đã có báo cáo đối chiếu tháng ${month}/${year}`, id: existing.id }, { status: 409 });

  const report = await prisma.$transaction(async (tx) => {
    const snapshot = await snapshotFinishedStock(warehouseId, tx);
    return tx.stockCountReport.create({
      data: {
        warehouseId, year, month,
        countDate: new Date(countDate),
        snapshotAt: new Date(),
        createdById: session.user.id,
        items: { createMany: { data: snapshot } },
      },
      select: { id: true },
    });
  });
  return NextResponse.json(report, { status: 201 });
}
