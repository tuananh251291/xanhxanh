import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";

// Tách riêng khỏi supplier-check.ts vì src/lib/order-lifecycle.ts cũng cần (supplier-check.ts phụ thuộc gián tiếp vào file đó).

// Báo vào tài khoản NCC — NCC chưa có tài khoản thì bỏ qua, QL Kho TP đang làm việc trực tiếp với NCC đó.
export async function notifySupplier(supplierUserId: string | null | undefined, title: string, message: string, relatedId: string) {
  if (!supplierUserId) return;
  await createAlert({ type: "SUPPLIER_CHECK_UPDATE", title, message, userId: supplierUserId, relatedId, relatedType: "SupplierCheck" });
}

// Gửi đích danh QL Kho TP, không dùng targetRole: alertTargetRolesFor cho NV Kho TP đọc chung, mà NV không vào được trang
// Kiểm tra NCC.
// warehouseId: chỉ báo QL của kho đó (kho làm việc của NV bán hàng); kho chưa có QL thì báo mọi QL để không mất việc.
export async function notifySupplierCheckManagers(title: string, message: string, relatedId: string, relatedType = "SupplierCheck", warehouseId?: string | null) {
  const all = await prisma.user.findMany({ where: { role: "QUAN_LY_KHO_THANH_PHAM", isActive: true }, select: { id: true, workplaceWarehouseId: true } });
  const ofWarehouse = warehouseId ? all.filter((m) => m.workplaceWarehouseId === warehouseId) : [];
  const managers = ofWarehouse.length > 0 ? ofWarehouse : all;
  await Promise.all(managers.map((m) => createAlert({ type: "SUPPLIER_CHECK_UPDATE", title, message, userId: m.id, relatedId, relatedType })));
}

// Đơn huỷ/hết hạn: Đơn kiểm tra chưa đặt hàng thôi hiệu lực, báo NCC thôi giữ hàng. Đơn đã Đặt hàng giữ nguyên — hàng vẫn về
// và thành tồn tự do.
export async function cancelOpenSupplierChecks(orderIds: string[]) {
  if (orderIds.length === 0) return;
  const open = await prisma.supplierCheck.findMany({
    where: { orderId: { in: orderIds }, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { id: true, code: true, supplier: { select: { userId: true } } },
  });
  if (open.length === 0) return;
  await prisma.supplierCheck.updateMany({ where: { id: { in: open.map((c) => c.id) } }, data: { status: "CANCELLED" } });
  await Promise.all(open.map((c) => notifySupplier(c.supplier.userId, `${c.code} đã huỷ`, "Đơn hàng đã huỷ — không cần giữ hàng cho đơn kiểm tra này nữa.", c.id)));
}
