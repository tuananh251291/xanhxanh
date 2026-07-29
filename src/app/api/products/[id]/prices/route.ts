import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  price: z.number().positive(),
  // Định dạng "YYYY-MM" — tháng áp dụng, luôn quy về ngày 1 đầu tháng.
  month: z.string().regex(/^\d{4}-\d{2}$/, "Định dạng tháng không hợp lệ"),
});

// Admin cấp cao thêm/sửa giá áp dụng cho 1 tháng cụ thể — upsert theo (productId, effectiveMonth) để
// cho phép sửa lại giá đã nhập nhầm trong cùng tháng mà không tạo bản ghi trùng.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền cập nhật giá" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ message: "Không tìm thấy sản phẩm" }, { status: 404 });

  const [year, month] = parsed.data.month.split("-").map(Number);
  const effectiveMonth = new Date(Date.UTC(year, month - 1, 1));

  const item = await prisma.productPrice.upsert({
    where: { productId_effectiveMonth: { productId: id, effectiveMonth } },
    update: { price: parsed.data.price, createdById: session.user.id },
    create: { productId: id, effectiveMonth, price: parsed.data.price, createdById: session.user.id },
  });
  return NextResponse.json(item, { status: 201 });
}
