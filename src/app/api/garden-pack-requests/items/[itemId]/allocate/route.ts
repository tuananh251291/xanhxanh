import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { InventoryError } from "@/lib/garden-inventory";
import { allocateForPackItem } from "@/lib/garden-packing";
import { z } from "zod";

const schema = z.object({
  lineId: z.string().min(1, "Chọn nguồn cây"),
  quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
});

// Nghiệp vụ 7 — QLV phân bổ cây cho 1 dòng phiếu giao vườn từ 1 dòng tồn Kho thành phẩm/Kho thanh lý đúng mã cây +
// size (chỉ giữ chỗ phần khả dụng, chưa trừ tồn vật lý). Xem allocateForPackItem.
export async function POST(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { itemId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const item = await prisma.gardenPackRequestItem.findUnique({ where: { id: itemId }, select: { request: { select: { gardenId: true } } } });
  if (!item) return NextResponse.json({ message: "Không tìm thấy dòng phiếu giao vườn" }, { status: 404 });
  if (!(await canManageGarden(session.user, item.request.gardenId))) return NextResponse.json({ message: "Chỉ Quản lý vườn được phân bổ" }, { status: 403 });

  try {
    await prisma.$transaction((tx) => allocateForPackItem(tx, { itemId, lineId: parsed.data.lineId, quantity: parsed.data.quantity, byId: session.user.id }), { timeout: 30000 });
    return NextResponse.json({ success: true, message: `Đã phân bổ ${parsed.data.quantity.toLocaleString("vi-VN")} cây` });
  } catch (err) {
    if (err instanceof InventoryError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
