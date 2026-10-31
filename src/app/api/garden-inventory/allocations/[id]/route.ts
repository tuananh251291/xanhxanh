import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { shipAllocation, cancelAllocation, cleanupEmptyLines, InventoryError } from "@/lib/garden-inventory";
import { completePackRequestIfDone, notifyPackRequestDone, recordPacked } from "@/lib/garden-packing";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  // Xác nhận xuất kho thực tế (1 phần hoặc toàn bộ phần còn chờ) — lúc này mới trừ tồn vật lý.
  z.object({ action: z.literal("ship"), quantity: z.number().int().positive() }),
  // Huỷ phân bổ (kể cả khi đang đóng gói) — chỉ giải phóng phần chưa xuất về đúng dòng tồn nguồn.
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(500).optional() }),
  // Nghiệp vụ 7 — QLV ghi nhận TỔNG số NV đóng gói đã đóng xong (phân bổ theo phiếu giao vườn), không đổi tồn.
  z.object({ action: z.literal("pack"), packedQuantity: z.number().int().nonnegative() }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const allocation = await prisma.gardenAllocation.findUnique({ where: { id }, select: { gardenId: true } });
  if (!allocation) return NextResponse.json({ message: "Không tìm thấy phân bổ" }, { status: 404 });
  if (!(await canManageGarden(session.user, allocation.gardenId))) return NextResponse.json({ message: "Chỉ Quản lý vườn được thao tác" }, { status: 403 });

  try {
    if (parsed.data.action === "ship") {
      const quantity = parsed.data.quantity;
      const done = await prisma.$transaction(async (tx) => {
        await shipAllocation(tx, { allocationId: id, quantity, byId: session.user.id });
        await cleanupEmptyLines(tx, allocation.gardenId);
        return completePackRequestIfDone(tx, id);
      });
      if (done) await notifyPackRequestDone(done);
      return NextResponse.json({ success: true, message: `Đã xác nhận xuất kho ${quantity.toLocaleString("vi-VN")} cây${done ? ` — phiếu ${done.code} đã xuất đủ` : ""}` });
    }
    if (parsed.data.action === "pack") {
      const packedQuantity = parsed.data.packedQuantity;
      await prisma.$transaction((tx) => recordPacked(tx, { allocationId: id, packedQuantity, byId: session.user.id }));
      return NextResponse.json({ success: true, message: `Đã ghi nhận ${packedQuantity.toLocaleString("vi-VN")} cây đã đóng gói` });
    }
    const reason = parsed.data.reason;
    const released = await prisma.$transaction((tx) => cancelAllocation(tx, { allocationId: id, byId: session.user.id, reason: reason || "QLV huỷ phân bổ" }));
    if (released === 0) return NextResponse.json({ message: "Phân bổ không còn số chưa xuất để huỷ" }, { status: 400 });
    return NextResponse.json({ success: true, message: `Đã huỷ phân bổ — giải phóng ${released.toLocaleString("vi-VN")} cây về kho nguồn` });
  } catch (err) {
    if (err instanceof InventoryError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
