import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import { z } from "zod";

const patchSchema = z.object({
  pickedQuantity1: z.number().int().min(0).optional(),
  pickedQuantity2: z.number().int().min(0).optional(),
  pickedQuantity3: z.number().int().min(0).optional(),
  pickNotes: z.string().nullable().optional(),
});

// Ghi số lượng đã nhặt (3 lần) + ghi chú nội bộ cho 1 dòng đơn hàng — trang "Sắp xếp đơn hàng"
// (/orders/pack/[id]). Chỉ NV/QL kho thành phẩm (và Admin) được sửa, chỉ sửa được khi đơn còn CONFIRMED
// (đang chờ xuất) — đơn đã SHIPPED/CANCELLED thì không còn ý nghĩa để nhặt hàng nữa.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(isKhoThanhPhamRole(role) || isAdminRole(role))) {
    return NextResponse.json({ message: "Chỉ NV/Quản lý kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const item = await prisma.orderItem.findUnique({ where: { id }, select: { order: { select: { status: true } } } });
  if (!item) return NextResponse.json({ message: "Không tìm thấy dòng đơn hàng" }, { status: 404 });
  if (item.order.status !== "CONFIRMED") {
    return NextResponse.json({ message: "Đơn hàng không ở trạng thái chờ xuất — không thể sửa số lượng đã nhặt" }, { status: 400 });
  }

  const updated = await prisma.orderItem.update({
    where: { id },
    data: parsed.data,
    select: { id: true, pickedQuantity1: true, pickedQuantity2: true, pickedQuantity3: true, pickNotes: true },
  });
  return NextResponse.json(updated);
}
