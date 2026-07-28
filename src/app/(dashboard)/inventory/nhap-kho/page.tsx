import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PackagePlus } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import StockInForm from "./stock-in-form";

export default async function NhapKhoPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/nhap-kho"))) redirect("/dashboard");
  if (role !== "KHO_MO" && !isAdminRole(role)) redirect("/dashboard");

  const isAdmin = isAdminRole(role);
  const workplaceWarehouseId = session!.user.workplaceWarehouseId;

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
          Ghi nhận trực tiếp số lượng cây ra rễ hoặc cụm mẫu mẹ vào 1 giàn kệ — cộng thêm vào số đang có
          hoặc cập nhật thay thế hẳn số lượng (VD sau khi kiểm kê). Hệ thống tự kiểm tra đúng mã cây được
          phép xếp và sức chứa còn lại của giàn kệ.
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
