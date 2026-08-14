import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { PackagePlus } from "lucide-react";
import { isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";
import StockInForm from "./stock-in-form";

// Tách khỏi page.tsx để dùng lại được y hệt ở cả route gốc (/inventory/nhap-kho) lẫn tab "Nhập kho thủ
// công" trong hub /production-management — xem plan gộp menu Admin, tránh trùng lặp logic.
export default async function NhapKhoContent({
  role, workplaceWarehouseId,
}: {
  role: UserRole | null;
  workplaceWarehouseId: string | null | undefined;
}) {
  const isAdmin = isAdminRole(role);

  // KHO_MO chỉ thao tác đúng kho làm việc (workplaceWarehouseId, không cho chọn kho khác) — Admin/Admin
  // cấp cao được thao tác mọi kho sản xuất nên cần tự chọn trong form, không có kho mặc định cố định.
  const [fixedWarehouse, warehouses, plantTypes] = await Promise.all([
    !isAdmin && workplaceWarehouseId
      ? prisma.warehouse.findUnique({ where: { id: workplaceWarehouseId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    isAdmin
      ? prisma.warehouse.findMany({ where: { type: "SAN_XUAT", isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.plantType.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const canUseForm = isAdmin ? warehouses.length > 0 : !!fixedWarehouse;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackagePlus className="w-6 h-6 text-primary-strong" /> Nhập kho thủ công
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Ghi nhận trực tiếp số lượng cây ra rễ hoặc cụm mẫu mẹ vào Phòng sáng (1 giàn kệ) hoặc Phòng tối
          (1 NV cấy mô) — cộng thêm vào số đang có hoặc cập nhật thay thế hẳn số lượng (VD sau khi kiểm
          kê). Hệ thống tự kiểm tra đúng mã cây được phép xếp và sức chứa còn lại của giàn kệ.
        </p>
      </div>

      {!canUseForm ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>
            {isAdmin
              ? "Chưa có kho sản xuất nào đang hoạt động — tạo kho ở mục Kho & Kệ trước khi dùng chức năng này"
              : "Bạn chưa được gán kho làm việc — liên hệ Admin cấp cao để được gán trước khi dùng chức năng này"}
          </p>
        </CardContent></Card>
      ) : (
        <StockInForm fixedWarehouse={fixedWarehouse} warehouses={warehouses} plantTypes={plantTypes} />
      )}
    </div>
  );
}
