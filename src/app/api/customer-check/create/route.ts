import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { normalizeCustomerName, normalizeWebsite } from "@/lib/customer";

const schema = z.object({
  name: z.string().trim().min(1, "Nhập tên khách hàng - công ty"),
  website: z.string().trim().min(1, "Nhập website"),
  marketId: z.string().min(1, "Chọn thị trường"),
  email: z.string().trim().email("Email không hợp lệ"),
  phone: z.string().trim().min(1, "Nhập số điện thoại"),
});

// NV bán hàng tạo mới 1 khách hàng chưa từng có trong hệ thống + tự đăng ký phụ trách luôn — server tự
// gán NV phụ trách = NV đang đăng nhập, Trạng thái = Đã phân công, Ngày đầu tiếp cận = hôm nay.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được tính năng này" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const data = parsed.data;

  const market = await prisma.market.findUnique({ where: { id: data.marketId } });
  if (!market) return NextResponse.json({ message: "Thị trường không tồn tại" }, { status: 400 });

  const nameNormalized = normalizeCustomerName(data.name);
  const websiteNormalized = normalizeWebsite(data.website);
  // Race condition: 2 NV cùng bấm "Tiếp tục" cho cùng 1 khách gần như đồng thời — chặn lại ở đây thay
  // vì chỉ dựa vào bước "Kiểm tra" trước đó (đã có thể lỗi thời tại thời điểm submit).
  const duplicate = await prisma.customer.findFirst({ where: { OR: [{ nameNormalized }, { websiteNormalized }] } });
  if (duplicate) {
    return NextResponse.json({ message: "Khách này vừa được tạo/đăng ký bởi người khác, vui lòng kiểm tra lại" }, { status: 409 });
  }

  const customer = await prisma.customer.create({
    data: {
      name: data.name,
      nameNormalized,
      website: data.website,
      websiteNormalized,
      marketId: data.marketId,
      email: data.email,
      phone: data.phone,
      status: "DA_PHAN_CONG",
      firstContactAt: new Date(),
      assignedToId: session.user.id,
    },
  });
  return NextResponse.json(customer, { status: 201 });
}
