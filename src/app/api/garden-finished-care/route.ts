import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { moveStock, removeStock, cleanupEmptyLines, InventoryError } from "@/lib/garden-inventory";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["DAMAGE", "LIQUIDATE"]),
  lineId: z.string().min(1),
  quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
  // Tồn QLV đang thấy khi xác nhận — lệch thì từ chối (chặn gửi trùng 2 lần / tồn vừa đổi).
  expectedQuantity: z.number().int().nonnegative(),
  note: z.string().trim().max(500).optional(),
});

// Nghiệp vụ 6 — Chăm sóc cây thành phẩm: QLV kiểm tra thực tế rồi trên 1 dòng tồn Kho thành phẩm (mã cây, lô, size,
// vị trí) ghi nhận cây hỏng (trừ hẳn khỏi tồn) hoặc chuyển 1 phần/toàn bộ sang Kho thanh lý (giữ lô, size, vị trí,
// NV). Chỉ lấy phần KHẢ DỤNG (không đụng phần đã phân bổ đơn hàng), 1 transaction + lịch sử GardenMovementLog.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { action, lineId, quantity, expectedQuantity, note } = parsed.data;

  const line = await prisma.gardenStockLine.findUnique({ where: { id: lineId }, select: { gardenId: true, pool: true } });
  if (!line) return NextResponse.json({ message: "Không tìm thấy dòng tồn — tải lại trang" }, { status: 404 });
  if (!(await canManageGarden(session.user, line.gardenId))) return NextResponse.json({ message: "Chỉ Quản lý vườn được ghi nhận" }, { status: 403 });
  if (line.pool !== "FINISHED") return NextResponse.json({ message: "Dòng tồn không còn ở Kho thành phẩm — tải lại trang" }, { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      if (action === "DAMAGE") {
        await removeStock(tx, { lineId, quantity, expectedQuantity, type: "FINISHED_DAMAGE", note: note || null, byId: session.user.id });
      } else {
        await moveStock(tx, { lineId, quantity, expectedQuantity, toPool: "LIQUIDATION", type: "TO_LIQUIDATION", note: note || null, byId: session.user.id });
      }
      await cleanupEmptyLines(tx, line.gardenId);
    }, { timeout: 30000 });
    const n = quantity.toLocaleString("vi-VN");
    return NextResponse.json({ success: true, message: action === "DAMAGE" ? `Đã ghi nhận ${n} cây hỏng` : `Đã chuyển ${n} cây sang Kho thanh lý` });
  } catch (err) {
    if (err instanceof InventoryError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
