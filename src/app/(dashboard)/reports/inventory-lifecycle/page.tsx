import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Boxes } from "lucide-react";
import { isAdminRole } from "@/types";
import InventoryLifecycleReport from "../inventory-lifecycle-report";

// Trang riêng (không phải tab trong /reports) để NV Kỹ thuật/Kho mô xem được — CHỈ đúng cơ sở sản xuất
// mình đang làm việc (workplaceWarehouseId), ép cứng ở đây (Admin/Admin cấp cao/Admin kỹ thuật vẫn xem
// toàn hệ thống như tab gốc) — cùng quy ước phạm vi xem đã dùng ở reports/inspection-lane,
// reports/production-capacity.
export default async function InventoryLifecyclePage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO") redirect("/dashboard");

  const scopeWarehouseId = isAdminRole(role) ? null : (session?.user?.workplaceWarehouseId ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Boxes className="w-6 h-6 text-primary-strong" /> Quá hạn
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Lô sắp/quá hạn chuyển giai đoạn
          {!isAdminRole(role) ? " — đúng cơ sở sản xuất bạn đang làm việc" : ""}
        </p>
      </div>

      {!isAdminRole(role) && !scopeWarehouseId ? (
        <Card><CardContent className="py-12 text-center text-text-muted">
          Bạn chưa được gán địa điểm làm việc — liên hệ Admin cấp cao để được gán trước khi xem báo cáo này.
        </CardContent></Card>
      ) : (
        <InventoryLifecycleReport warehouseId={scopeWarehouseId} />
      )}
    </div>
  );
}
