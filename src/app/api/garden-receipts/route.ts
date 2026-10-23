import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { generateGardenReceiptCode } from "@/lib/codes";
import { InsufficientRoomStockError } from "@/lib/finished-goods";
import { getGardenReceiptSender, getSenderMovableLots } from "@/lib/garden-receipt";
import { summarizeMovable } from "@/lib/room-move";
import { z } from "zod";

const schema = z.object({
  gardenId: z.string().min(1, "Chưa chọn vườn nhận"),
  // Bắt buộc với Kho thành phẩm (Phòng đạt tiêu chuẩn/Phòng chờ xử lý); Khu sản xuất bỏ trống (Phòng ra rễ).
  roomId: z.string().optional(),
  lines: z
    .array(z.object({ plantTypeId: z.string().min(1), stageCode: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1, "Chưa có dòng nào"),
  notes: z.string().trim().max(500).optional(),
});

// Kho thành phẩm/Khu sản xuất lập phiếu bàn giao cây mô về 1 Vườn sản xuất — tồn bên giao TRỪ NGAY (FIFO, chỉ
// phần còn giao được — xem getSenderMovableLots), phiếu chờ Quản lý vườn giao kiểm đếm. Xem model GardenReceipt.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const sender = await getGardenReceiptSender(session.user);
  if (!sender) return NextResponse.json({ message: "Chỉ Kho thành phẩm hoặc Kho mô khu sản xuất mới lập được phiếu bàn giao về vườn" }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { gardenId, roomId, lines, notes } = parsed.data;
  if (sender.kind === "KTP" && !roomId) return NextResponse.json({ message: "Chưa chọn phòng nguồn" }, { status: 400 });

  const garden = await prisma.productionGarden.findFirst({ where: { id: gardenId, isActive: true }, select: { id: true, name: true, managerId: true } });
  if (!garden) return NextResponse.json({ message: "Vườn nhận không hợp lệ" }, { status: 400 });

  const wanted = new Map<string, number>();
  for (const l of lines) wanted.set(`${l.plantTypeId}:${l.stageCode}`, (wanted.get(`${l.plantTypeId}:${l.stageCode}`) ?? 0) + l.quantity);
  const plantTypes = await prisma.plantType.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.plantTypeId))] } }, select: { id: true, code: true } });
  const ptById = new Map(plantTypes.map((p) => [p.id, p]));
  if (lines.some((l) => !ptById.has(l.plantTypeId))) return NextResponse.json({ message: "Mã cây không hợp lệ" }, { status: 400 });

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      // Đọc lại trong transaction — không tin số client đã xem.
      const movable = await getSenderMovableLots(sender, sender.kind === "KTP" ? roomId! : null, tx);
      const availableByKey = summarizeMovable(movable);
      for (const [key, qty] of wanted) {
        const [plantTypeId, stageCode] = key.split(":");
        const available = availableByKey.get(key) ?? 0;
        if (available < qty) {
          throw new InsufficientRoomStockError(`${ptById.get(plantTypeId)!.code} ${stageCode}: chỉ còn ${available.toLocaleString("vi-VN")} cây giao được (cần ${qty.toLocaleString("vi-VN")})`);
        }
      }
      for (const [key, qty] of wanted) {
        const [plantTypeId, stageCode] = key.split(":");
        let remaining = qty;
        for (const lot of movable) {
          if (remaining <= 0) break;
          if (lot.plantTypeId !== plantTypeId || lot.stageCode !== stageCode) continue;
          const take = Math.min(lot.available, remaining);
          await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
          remaining -= take;
        }
      }
      return tx.gardenReceipt.create({
        data: {
          code: await generateGardenReceiptCode(tx),
          gardenId,
          fromWarehouseId: sender.warehouseId,
          fromRoomId: sender.kind === "KTP" ? roomId : null,
          notes,
          createdById: session.user.id,
          items: {
            create: [...wanted].map(([key, quantity]) => {
              const [plantTypeId, stageCode] = key.split(":");
              return { plantTypeId, stageCode, quantity };
            }),
          },
        },
        select: { id: true, code: true },
      });
    }, { timeout: 30000 });

    const total = [...wanted.values()].reduce((s, q) => s + q, 0);
    const recipients = garden.managerId
      ? [garden.managerId]
      : (await prisma.user.findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true } })).map((u) => u.id);
    for (const userId of recipients) {
      await createAlert({
        type: "GARDEN_RECEIPT_CREATED",
        title: "Có phiếu bàn giao cây về vườn",
        message: `${sender.warehouseName} bàn giao ${total.toLocaleString("vi-VN")} cây (${wanted.size} dòng) về ${garden.name} — phiếu ${receipt.code}, giao kiểm đếm và xác nhận số thực nhận.`,
        userId,
        relatedId: receipt.id,
        relatedType: "GardenReceipt",
      });
    }
    return NextResponse.json({ success: true, id: receipt.id, code: receipt.code }, { status: 201 });
  } catch (err) {
    if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
    throw err;
  }
}
