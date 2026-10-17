import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Danh sách khách hàng NV bán hàng đang đăng nhập phụ trách (toàn bộ, không lọc trạng thái, để NV thấy
// cả lịch sử khách đã bị thu hồi trước đó nếu có) + khách của nhân sự mình quản lý (nếu có) — "quản lý"
// suy ra từ SalesManagerAssignment(managerId = mình): chỉ khách của NV đó TRONG ĐÚNG thị trường được giao
// quản lý (xem getCustomerManager, src/lib/customer-manager.ts). Khách của nhân sự chỉ xem (isMine=false),
// cập nhật vẫn chỉ đúng NV phụ trách (PATCH /api/customer-status/[id]).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được tính năng này" }, { status: 403 });
  }
  const userId = session.user.id;
  const managed = await prisma.salesManagerAssignment.findMany({
    where: { managerId: userId, salesUserId: { not: userId } },
    select: { salesUserId: true, marketId: true },
  });
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { assignedToId: userId },
        ...managed.map((a) => ({ assignedToId: a.salesUserId, marketId: a.marketId })),
      ],
    },
    select: {
      id: true, code: true, name: true, website: true, status: true, customerGroup: true,
      market: { select: { code: true, name: true } },
      firstContactAt: true, lastOrderAt: true, lastOrderCode: true,
      assignedToId: true, assignedTo: { select: { code: true, name: true } },
    },
    orderBy: { firstContactAt: "desc" },
  });
  return NextResponse.json(customers.map(({ assignedToId, ...c }) => ({ ...c, isMine: assignedToId === userId })));
}
