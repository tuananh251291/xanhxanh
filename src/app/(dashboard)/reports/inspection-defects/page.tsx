import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import InspectionDefectBoard from "./inspection-defect-board";

// Báo cáo "Phiếu kiểm tra hàng không đạt/nhiễm" cho Admin/Admin cấp cao/Admin kỹ thuật + NV Kỹ thuật/Kho
// mô (cùng phạm vi quyền với /reports/inspection-lane) — xem
// src/app/api/reports/inspection-defects/route.ts + src/lib/inspection-defect-report.ts.
export default async function InspectionDefectsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO") redirect("/dashboard");

  const scopeWarehouseId = !isAdminRole(role) ? (session?.user?.workplaceWarehouseId ?? null) : null;

  const warehouses = await prisma.warehouse.findMany({
    where: { type: "SAN_XUAT", ...(scopeWarehouseId ? { id: scopeWarehouseId } : {}) },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-primary-strong" /> Phiếu kiểm tra hàng không đạt/nhiễm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Danh sách phiếu kiểm tra (luồng Vàng/Đỏ) có ghi nhận hàng không đạt yêu cầu hoặc hàng nhiễm, theo
          từng NV cấy mô — xem mỗi NV bị trừ bao nhiêu, lọc theo khu sản xuất và tháng.
        </p>
      </div>
      <InspectionDefectBoard warehouses={warehouses} />
    </div>
  );
}
