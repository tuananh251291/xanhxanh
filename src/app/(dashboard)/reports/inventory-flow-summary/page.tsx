import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import GoodsFlowSummaryBoard from "./goods-flow-summary-board";

// Báo cáo cho Admin (mọi kho, chọn được kho) + Quản lý kho thành phẩm (chỉ kho mình phụ trách, ẩn bộ lọc
// kho) — xem src/app/api/reports/inventory-flow-summary/route.ts.
export default async function InventoryFlowSummaryPage() {
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
          <ArrowLeftRight className="w-6 h-6 text-primary-strong" /> Tổng hợp Nhập - Xuất
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tổng số lượng nhập (từ NCC) và xuất (đơn hàng, khu sản xuất, trồng/hủy) trong khoảng thời gian,
          xem chi tiết theo từng loại.
        </p>
      </div>
      <GoodsFlowSummaryBoard warehouses={warehouses} showWarehouseFilter={role !== "QUAN_LY_KHO_THANH_PHAM"} />
    </div>
  );
}
