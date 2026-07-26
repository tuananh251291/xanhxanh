import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z
  .object({
    name: z.string().min(2).optional(),
    isActive: z.boolean().optional(),
    allowsReturn: z.boolean().optional(),
    returnWindowDays: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => !d.allowsReturn || d.returnWindowDays === undefined || (d.returnWindowDays !== null && d.returnWindowDays > 0), {
    message: "Cần nhập số ngày được phép trả hàng (lớn hơn 0)",
    path: ["returnWindowDays"],
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền sửa nhà cung cấp" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const data = { ...parsed.data };
  if (data.allowsReturn === false) data.returnWindowDays = null;

  const item = await prisma.supplier.update({ where: { id }, data });
  return NextResponse.json(item);
}

// Xóa cứng — khác warehouses/rooms/shelves (soft-delete vì Lot có thể còn tham chiếu tới lịch sử tồn
// kho). Supplier không giữ lịch sử tồn kho trực tiếp, chỉ chặn nếu đã có phiếu nhập hàng (GoodsReceipt,
// supplierId bắt buộc — không thể chỉ gỡ tham chiếu như shelf-groups).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền xóa nhà cung cấp" }, { status: 403 });
  }

  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!supplier) return NextResponse.json({ message: "Không tìm thấy nhà cung cấp" }, { status: 404 });

  const receiptCount = await prisma.goodsReceipt.count({ where: { supplierId: id } });
  if (receiptCount > 0) {
    return NextResponse.json(
      { message: `Không thể xóa — nhà cung cấp "${supplier.code}" đã có ${receiptCount} phiếu nhập hàng trong hệ thống` },
      { status: 409 }
    );
  }

  await prisma.supplier.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
