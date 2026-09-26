import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import { BarChart3 } from "lucide-react";
import PartnerReportBoard from "./partner-report-board";

// Báo cáo cho Đối tác vận hành (Kho thị trường) — cùng phạm vi quyền xem với /inventory/thi-truong: Đối
// tác chỉ xem đúng kho mình phụ trách, Admin xem tất cả Kho thị trường, NV bán hàng có "Quản lý bán lẻ"
// xem đúng các kho được gán qua RetailWarehouseAccess.
export default async function PartnerReportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  const isAdmin = isAdminRole(role);
  const isDoiTacVanHanh = role === "DOI_TAC_VAN_HANH";

  let isSaleRetailManager = false;
  let retailWarehouseIds: string[] = [];
  if (role === "SALE" && session?.user?.id) {
    const saleUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isRetailManager: true, retailWarehouseAccess: { select: { warehouseId: true } } },
    });
    isSaleRetailManager = saleUser?.isRetailManager ?? false;
    retailWarehouseIds = saleUser?.retailWarehouseAccess.map((a) => a.warehouseId) ?? [];
  }

  if (!isDoiTacVanHanh && !isAdmin && !isSaleRetailManager) redirect("/dashboard");
  if (!(await isPageAllowed(role, "/reports/partner"))) redirect("/dashboard");

  const warehouseId = session!.user.workplaceWarehouseId;
  if (isDoiTacVanHanh && !warehouseId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Báo cáo</h1>
        <p className="text-text-secondary text-sm">Bạn chưa được gán Kho thị trường phụ trách — liên hệ Admin cấp cao.</p>
      </div>
    );
  }
  if (isSaleRetailManager && retailWarehouseIds.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Báo cáo</h1>
        <p className="text-text-secondary text-sm">Bạn chưa được gán Kho thị trường nào — liên hệ Admin.</p>
      </div>
    );
  }

  const warehouses =
    isAdmin || isSaleRetailManager
      ? await prisma.warehouse.findMany({
          where: { type: "THI_TRUONG", ...(isAdmin ? {} : { id: { in: retailWarehouseIds } }) },
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary-strong" /> Báo cáo
        </h1>
        <p className="text-text-secondary text-sm mt-1">Báo cáo tổng hợp cho Đối tác vận hành Kho thị trường.</p>
      </div>
      <PartnerReportBoard warehouses={warehouses} />
    </div>
  );
}
