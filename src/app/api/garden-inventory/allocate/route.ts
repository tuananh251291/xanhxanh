import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { allocateToOrder, InventoryError } from "@/lib/garden-inventory";
import { z } from "zod";

const schema = z.object({
  lineId: z.string().min(1),
  orderId: z.string().min(1, "Chưa chọn đơn hàng"),
  quantity: z.number().int().positive("Số lượng phân bổ phải lớn hơn 0"),
  note: z.string().trim().max(500).optional(),
});

// Nghiệp vụ 5, Hướng B — QLV phân bổ cây từ Kho thành phẩm/Kho thanh lý cho 1 đơn hàng Sale (HELD/CONFIRMED):
// giữ chỗ phần khả dụng, chuyển sang Chờ đóng gói, chưa trừ tồn vật lý. Xem allocateToOrder.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { lineId, orderId, quantity, note } = parsed.data;

  const line = await prisma.gardenStockLine.findUnique({ where: { id: lineId }, select: { gardenId: true } });
  if (!line) return NextResponse.json({ message: "Không tìm thấy dòng tồn" }, { status: 404 });
  if (!(await canManageGarden(session.user, line.gardenId))) return NextResponse.json({ message: "Chỉ Quản lý vườn được phân bổ" }, { status: 403 });

  try {
    await prisma.$transaction((tx) => allocateToOrder(tx, { lineId, orderId, quantity, note: note || null, byId: session.user.id }));
    return NextResponse.json({ success: true, message: `Đã phân bổ ${quantity.toLocaleString("vi-VN")} cây — chuyển sang Chờ đóng gói` }, { status: 201 });
  } catch (err) {
    if (err instanceof InventoryError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
