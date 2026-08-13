import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  lastOrderAt: z.string().min(1, "Chọn ngày ra đơn gần nhất"),
  lastOrderCode: z.string().trim().min(1, "Nhập mã đơn gần nhất"),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được tính năng này" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer || customer.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Không tìm thấy khách hàng thuộc quyền phụ trách của bạn" }, { status: 404 });
  }

  const updated = await prisma.customer.update({
    where: { id },
    data: { lastOrderAt: new Date(parsed.data.lastOrderAt), lastOrderCode: parsed.data.lastOrderCode },
  });

  // Tắt thông báo "Cần cập nhật tình trạng khách hàng" của tháng này — đúng yêu cầu tắt khi NV bấm
  // Cập nhật, xem ensureCustomerStatusReminders (src/lib/customer-lifecycle.ts) tạo alert với relatedId
  // "userId:yyyy-MM".
  const relatedId = `${session.user.id}:${format(new Date(), "yyyy-MM")}`;
  await prisma.alert.updateMany({
    where: { type: "CUSTOMER_STATUS_UPDATE_DUE", relatedId, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });

  return NextResponse.json(updated);
}
