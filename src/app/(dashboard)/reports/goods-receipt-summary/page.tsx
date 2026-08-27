import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import GoodsReceiptSummaryBoard from "./goods-receipt-summary-board";

// Báo cáo cho Admin (mọi kho, chọn được kho) + Quản lý kho thành phẩm (chỉ kho mình phụ trách, ẩn bộ lọc
// kho vì chỉ có đúng 1 lựa chọn) — xem src/app/api/reports/goods-receipt-summary/route.ts.
export default async function GoodsReceiptSummaryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "QUAN_LY_KHO_THANH_PHAM") redirect("/dashboard");

  const warehouses = role === "QUAN_LY_KHO_THANH_PHAM"
    ? await prisma.warehouse.findMany({
        where: { id: session?.user?.workplaceWarehouseId ?? "" },
        select: { id: true, code: true, name: true },
      })
    : await prisma.warehouse.findMany({
        where: { type: "THANH_PHAM" },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary-strong" /> Hàng nhập đạt từ NCC theo tháng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tổng hợp theo nhà cung cấp — số lượng tổng nhận (bàn giao) và số lượng được ghi nhận (đạt tiêu
          chuẩn) của các phiếu đã xác nhận, lọc theo tháng.
        </p>
      </div>
      <GoodsReceiptSummaryBoard warehouses={warehouses} showWarehouseFilter={role !== "QUAN_LY_KHO_THANH_PHAM"} />
    </div>
  );
}
