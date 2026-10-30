import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { moveStock, cleanupEmptyLines, InventoryError } from "@/lib/garden-inventory";
import { z } from "zod";

const schema = z.object({
  lineId: z.string().min(1),
  quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
  toPool: z.enum(["CONTAMINATED", "PLANNED", "FINISHED", "LIQUIDATION"]).optional(),
  toStage: z.string().trim().min(1).max(10).optional(),
  // undefined = giữ nguyên; null = bỏ vị trí (chưa xếp) / bỏ NV phụ trách.
  toRowId: z.string().nullable().optional(),
  toStaffId: z.string().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

// Nghiệp vụ 5, Hướng A — QLV điều phối 1 phần dòng tồn: chuyển kho / đổi size / đổi vị trí / đổi NV phụ trách
// (bất kỳ tổ hợp), chỉ lấy phần KHẢ DỤNG, cập nhật đồng bộ trong 1 transaction + lưu lịch sử. Xem moveStock.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { lineId, quantity, toPool, toStage, toRowId, toStaffId, note } = parsed.data;

  const line = await prisma.gardenStockLine.findUnique({ where: { id: lineId }, select: { gardenId: true } });
  if (!line) return NextResponse.json({ message: "Không tìm thấy dòng tồn" }, { status: 404 });
  if (!(await canManageGarden(session.user, line.gardenId))) return NextResponse.json({ message: "Chỉ Quản lý vườn được điều phối" }, { status: 403 });

  try {
    await prisma.$transaction(async (tx) => {
      await moveStock(tx, { lineId, quantity, toPool, toStage, toRowId, toStaffId, note: note || null, byId: session.user.id });
      await cleanupEmptyLines(tx, line.gardenId);
    });
    return NextResponse.json({ success: true, message: `Đã điều phối ${quantity.toLocaleString("vi-VN")} cây` });
  } catch (err) {
    if (err instanceof InventoryError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
