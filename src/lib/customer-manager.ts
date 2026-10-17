import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Tách riêng khỏi src/lib/customer.ts (chỉ chứa hàm thuần, không đụng prisma) — customer.ts được
// customer-check-form.tsx ("use client") import trực tiếp để dùng validateWebsite/hasWebsitePath ngay
// lúc gõ, nếu để chung 1 file thì cả import prisma (qua @prisma/adapter-pg → pg → dns/fs) bị kéo vào
// bundle trình duyệt, build lỗi "Module not found: Can't resolve 'dns'". File này chỉ import từ API
// route (server), không bao giờ được 1 client component import.
//
// "Nhân viên quản lý" của 1 khách hàng KHÔNG lưu cứng trên Customer — suy ra runtime từ
// SalesManagerAssignment(salesUserId=assignedToId, marketId) tại thời điểm xem, xem prisma/schema.prisma.
export async function getCustomerManager(assignedToId: string | null, marketId: string) {
  if (!assignedToId) return null;
  const assignment = await prisma.salesManagerAssignment.findUnique({
    where: { salesUserId_marketId: { salesUserId: assignedToId, marketId } },
    select: { manager: { select: { id: true, code: true, name: true } } },
  });
  return assignment?.manager ?? null;
}

// Phạm vi đơn hàng 1 NV bán hàng được XEM thêm (chỉ xem) ngoài đơn của chính mình: đơn của nhân sự mình quản
// lý (SalesManagerAssignment managerId = mình) — khách trong ĐÚNG thị trường được giao quản lý; đơn không gắn
// Customer (khách chưa có trong hệ thống / Kho thị trường — không suy ra được thị trường) tính theo NV đó có
// được mình quản lý ở bất kỳ thị trường nào. Rỗng = không quản lý ai. Dùng làm OR trong Prisma OrderWhereInput.
export async function getManagedOrderScope(managerId: string): Promise<Prisma.OrderWhereInput[]> {
  const managed = await prisma.salesManagerAssignment.findMany({
    where: { managerId, salesUserId: { not: managerId } },
    select: { salesUserId: true, marketId: true },
  });
  if (managed.length === 0) return [];
  return [
    ...managed.map((a) => ({ saleId: a.salesUserId, customer: { marketId: a.marketId } })),
    { saleId: { in: [...new Set(managed.map((a) => a.salesUserId))] }, customerId: null },
  ];
}

// NV bán hàng `userId` có được xem đơn `orderId` không — đơn của chính mình hoặc thuộc getManagedOrderScope.
export async function canSaleViewOrder(userId: string, orderId: string): Promise<boolean> {
  const scope = await getManagedOrderScope(userId);
  const count = await prisma.order.count({ where: { id: orderId, OR: [{ saleId: userId }, ...scope] } });
  return count > 0;
}
