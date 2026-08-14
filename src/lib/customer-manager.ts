import { prisma } from "@/lib/prisma";

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
