import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfMonth, addMonths, parse, isValid } from "date-fns";

// Báo cáo "Hàng nhập đạt từ NCC theo tháng" — cho Admin (mọi kho, lọc được theo kho) + Quản lý kho thành
// phẩm (CHỈ xem đúng kho mình phụ trách — luôn ép warehouseId theo workplaceWarehouseId, bỏ qua tham số
// client gửi lên, tránh xem chéo kho khác). Chỉ tính phiếu status=CONFIRMED, nguồn NCC ngoài (supplierId
// — bỏ qua phiếu nguồn khu sản xuất nội bộ, xem GoodsReceipt.productionGardenId). "Tháng" lọc theo
// confirmedAt (mốc hàng thật về/được xác nhận) — phiếu CONFIRMED cũ tạo trước khi có field này (tạo thẳng
// "Đã có hàng thật", không qua PATCH confirm) thì confirmedAt NULL, fallback dùng createdAt.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const requestedWarehouseId = searchParams.get("warehouseId") || undefined;
  const warehouseId = role === "QUAN_LY_KHO_THANH_PHAM" ? (session?.user?.workplaceWarehouseId ?? "__none__") : requestedWarehouseId;

  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const monthDate = isValid(parsedMonth) ? parsedMonth : new Date();
  const rangeStart = startOfMonth(monthDate);
  const rangeEnd = addMonths(rangeStart, 1);

  const dateFilter = {
    OR: [
      { confirmedAt: { gte: rangeStart, lt: rangeEnd } },
      { confirmedAt: null, createdAt: { gte: rangeStart, lt: rangeEnd } },
    ],
  };

  const receipts = await prisma.goodsReceipt.findMany({
    where: {
      status: "CONFIRMED",
      supplierId: { not: null },
      ...(warehouseId ? { room: { warehouseId } } : {}),
      ...dateFilter,
    },
    select: {
      supplierId: true,
      supplier: { select: { code: true, name: true } },
      items: { select: { quantityDelivered: true, quantityPassed: true } },
    },
  });

  const bySupplier = new Map<string, { code: string; name: string; delivered: number; passed: number; receiptCount: number }>();
  for (const r of receipts) {
    if (!r.supplierId || !r.supplier) continue;
    const entry = bySupplier.get(r.supplierId) ?? { code: r.supplier.code, name: r.supplier.name, delivered: 0, passed: 0, receiptCount: 0 };
    entry.receiptCount += 1;
    for (const item of r.items) {
      entry.delivered += item.quantityDelivered;
      entry.passed += item.quantityPassed;
    }
    bySupplier.set(r.supplierId, entry);
  }

  const rows = Array.from(bySupplier.entries())
    .map(([supplierId, e]) => ({
      supplierId,
      supplierCode: e.code,
      supplierName: e.name,
      receiptCount: e.receiptCount,
      totalDelivered: e.delivered,
      totalPassed: e.passed,
    }))
    .sort((a, b) => b.totalDelivered - a.totalDelivered || a.supplierName.localeCompare(b.supplierName));

  const totalDelivered = rows.reduce((s, r) => s + r.totalDelivered, 0);
  const totalPassed = rows.reduce((s, r) => s + r.totalPassed, 0);

  return NextResponse.json({
    rangeStart,
    rangeEnd,
    rows,
    summary: { totalDelivered, totalPassed, supplierCount: rows.length },
  });
}
