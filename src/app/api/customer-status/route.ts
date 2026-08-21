import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Danh sách khách hàng NV bán hàng đang đăng nhập phụ trách (toàn bộ, không lọc trạng thái, để NV thấy
// cả lịch sử khách đã bị thu hồi trước đó nếu có).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được tính năng này" }, { status: 403 });
  }
  const customers = await prisma.customer.findMany({
    where: { assignedToId: session.user.id },
    select: {
      id: true, code: true, name: true, website: true, status: true, customerGroup: true,
      market: { select: { code: true, name: true } },
      firstContactAt: true, lastOrderAt: true, lastOrderCode: true,
    },
    orderBy: { firstContactAt: "desc" },
  });
  return NextResponse.json(customers);
}
