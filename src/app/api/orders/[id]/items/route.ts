import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { canEditOrderItems, editOrderItems, getOrderEditData, OrderEditError } from "@/lib/order-edit";

const schema = z.object({
  lines: z.array(z.object({ plantTypeId: z.string().min(1), stageCode: z.string().min(1), quantity: z.number().int().positive() })),
  removeItemIds: z.array(z.string()).default([]),
});

// Dữ liệu hộp thoại "Sửa đơn" — xem src/lib/order-edit.ts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canEditOrderItems(session.user.role)) {
    return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm / Admin cấp cao được sửa đơn hàng" }, { status: 403 });
  }
  const { id } = await params;
  const data = await getOrderEditData(id);
  if (!data) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  return NextResponse.json(data);
}

// Lưu sửa đơn: lines = TOÀN BỘ dòng thường mong muốn sau khi sửa (gộp theo mã cây + quy cách), removeItemIds =
// các dòng xử lý cây (chưa hoàn thành) cần xoá. Dòng khoá luôn giữ nguyên.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { id } = await params;
  try {
    const result = await editOrderItems({
      orderId: id,
      user: { id: session.user.id, name: session.user.name ?? "", role: session.user.role ?? null, workplaceWarehouseId: session.user.workplaceWarehouseId ?? null },
      lines: parsed.data.lines,
      removeItemIds: parsed.data.removeItemIds,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrderEditError) return NextResponse.json({ message: err.message }, { status: err.status });
    throw err;
  }
}
