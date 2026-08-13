import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ customerId: z.string().min(1) });

// NV bán hàng đăng ký phụ trách 1 khách đang "Chưa phân công" — gán NV phụ trách = NV đang đăng nhập,
// Ngày đầu tiếp cận = hôm nay (đúng yêu cầu: đăng ký lại tính lại mốc 2 tháng từ đầu).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được tính năng này" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const customer = await prisma.customer.findUnique({ where: { id: parsed.data.customerId } });
  if (!customer) return NextResponse.json({ message: "Không tìm thấy khách hàng" }, { status: 404 });
  // Race condition: NV khác vừa đăng ký trước đó — báo lại thay vì gán đè.
  if (customer.status !== "CHUA_PHAN_CONG") {
    return NextResponse.json({ message: "Khách này vừa được người khác đăng ký phụ trách, vui lòng kiểm tra lại" }, { status: 409 });
  }

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { status: "DA_PHAN_CONG", assignedToId: session.user.id, firstContactAt: new Date() },
  });
  return NextResponse.json(updated);
}
