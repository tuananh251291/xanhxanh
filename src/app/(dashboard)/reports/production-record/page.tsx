import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import ProductionRecordBoard from "./production-record-board";

// Báo cáo "Số lượng ghi nhận" cho Admin/Admin cấp cao + NV Kỹ thuật — xem
// src/app/api/reports/production-record/route.ts + src/lib/production-record-report.ts. KHÁC Bảng lương
// ở chỗ đây chỉ hiện số lượng (không quy đổi VNĐ, không có công/điểm/thưởng) nên mở quyền xem rộng hơn.
export default async function ProductionRecordPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT") redirect("/dashboard");

  // NV Kỹ thuật chỉ chọn được đúng khu sản xuất mình đang làm việc (khớp ép cứng ở API).
  const kyThuatWarehouseId = role === "KY_THUAT" ? (session?.user?.workplaceWarehouseId ?? null) : null;

  const warehouses = await prisma.warehouse.findMany({
    where: { type: "SAN_XUAT", ...(kyThuatWarehouseId ? { id: kyThuatWarehouseId } : {}) },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Boxes className="w-6 h-6 text-primary-strong" /> Số lượng ghi nhận
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Sản lượng ĐÃ ĐƯỢC GHI NHẬN của từng NV cấy mô trong khoảng ngày đã chọn (luồng Xanh tự trừ hàng
          không đạt, luồng Đỏ/Vàng theo số Kho mô đã kiểm tra và ghi nhận) — xem chi tiết theo từng ngày.
        </p>
      </div>
      <ProductionRecordBoard warehouses={warehouses} />
    </div>
  );
}
