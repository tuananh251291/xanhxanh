import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import ProductionCapacityBoard from "./production-capacity-board";

// Trang riêng (không phải tab trong /reports) để tránh xung đột chỉnh sửa đồng thời với
// src/app/(dashboard)/reports/page.tsx — menu "Năng lực sản xuất" (xem ROLE_NAV, src/types/index.ts).
// NV Kỹ thuật (KY_THUAT) cũng xem được, nhưng CHỈ đúng khu sản xuất mình đang làm việc — ép cứng ở cả
// đây (kyThuatWarehouseId) lẫn API (route.ts), khớp quy ước đã dùng ở /reports/production-record.
export default async function ProductionCapacityPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/reports/production-capacity")) || (!isAdminRole(role) && role !== "KY_THUAT")) {
    redirect("/dashboard");
  }
  const kyThuatWarehouseId = role === "KY_THUAT" ? (session?.user?.workplaceWarehouseId ?? null) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Gauge className="w-6 h-6 text-primary-strong" /> Năng lực sản xuất
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Sản lượng thực tế và dự kiến — theo mã sản phẩm, quy cách, phạm vi kho/nhân sự
        </p>
      </div>
      <ProductionCapacityBoard kyThuatWarehouseId={kyThuatWarehouseId} />
    </div>
  );
}
