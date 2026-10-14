import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateLotCode } from "@/lib/codes";

// Đối chiếu tồn kho cuối tháng — Kho thành phẩm (/stock-counts, xem StockCountReport trong schema.prisma).

// Phòng của Kho thành phẩm có tồn để đối chiếu (lô gắn thẳng vào phòng, không qua kệ).
export const STOCK_COUNT_ROOM_TYPES = ["PHONG_DAT_TIEU_CHUAN", "PHONG_THEO_DOI", "PHONG_HAN_TUI", "PHONG_THI_TRUONG"] as const;

type Client = Prisma.TransactionClient | typeof prisma;
const comboKey = (roomId: string, plantTypeId: string, stageCode: string) => `${roomId}::${plantTypeId}::${stageCode}`;

// Tồn phần mềm hiện tại theo (phòng + mã cây + quy cách) của 1 kho — chỉ combo còn hàng (quantity > 0).
export async function snapshotFinishedStock(warehouseId: string, client: Client = prisma) {
  const groups = await client.lot.groupBy({
    by: ["roomId", "plantTypeId", "stageCode"],
    where: {
      status: "ACTIVE",
      quantity: { gt: 0 },
      room: { warehouseId, type: { in: [...STOCK_COUNT_ROOM_TYPES] } },
    },
    _sum: { quantity: true },
  });
  return groups
    .filter((g) => g.roomId && (g._sum.quantity ?? 0) > 0)
    .map((g) => ({ roomId: g.roomId!, plantTypeId: g.plantTypeId, stageCode: g.stageCode, systemQuantity: g._sum.quantity ?? 0 }));
}

// Chụp lại tồn phần mềm cho báo cáo đang sửa: cập nhật systemQuantity các dòng có sẵn (GIỮ số thực tế + giải
// trình đã nhập), thêm combo mới phát sinh, bỏ dòng nay đã hết hàng mà chưa nhập gì (nhập rồi thì giữ, tồn 0).
export async function refreshStockCountSnapshot(reportId: string, warehouseId: string, client: Client = prisma) {
  const [snapshot, items] = await Promise.all([
    snapshotFinishedStock(warehouseId, client),
    client.stockCountItem.findMany({ where: { reportId } }),
  ]);
  const bySnap = new Map(snapshot.map((s) => [comboKey(s.roomId, s.plantTypeId, s.stageCode), s]));
  for (const item of items) {
    const snap = bySnap.get(comboKey(item.roomId, item.plantTypeId, item.stageCode));
    bySnap.delete(comboKey(item.roomId, item.plantTypeId, item.stageCode));
    const systemQuantity = snap?.systemQuantity ?? 0;
    if (!snap && item.actualQuantity == null && !item.explanation) {
      await client.stockCountItem.delete({ where: { id: item.id } });
    } else if (systemQuantity !== item.systemQuantity) {
      await client.stockCountItem.update({ where: { id: item.id }, data: { systemQuantity } });
    }
  }
  if (bySnap.size) {
    await client.stockCountItem.createMany({ data: [...bySnap.values()].map((s) => ({ reportId, ...s })) });
  }
  await client.stockCountReport.update({ where: { id: reportId }, data: { snapshotAt: new Date() } });
}

// Áp chênh lệch (thực tế − tồn phần mềm lúc chụp) của 1 dòng vào tồn hiện tại của đúng phòng + mã cây + quy
// cách. Thiếu: trừ dần từ lô cũ nhất (không trừ quá số đang có). Thừa: cộng vào lô mới nhất còn hàng (không có
// thì lô mới nhất bất kỳ), chưa từng có lô thì tạo lô điều chỉnh mới. Trả về số thực sự đã cộng/trừ.
export async function applyStockCountDelta(
  tx: Prisma.TransactionClient,
  item: { roomId: string; plantTypeId: string; stageCode: string; plantTypeCode: string },
  delta: number,
  staffCode: string
): Promise<number> {
  if (delta === 0) return 0;
  const lots = await tx.lot.findMany({
    where: { roomId: item.roomId, plantTypeId: item.plantTypeId, stageCode: item.stageCode, status: "ACTIVE" },
    select: { id: true, quantity: true },
    orderBy: [{ enteredAt: "asc" }, { createdAt: "asc" }],
  });

  if (delta < 0) {
    let remaining = -delta;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.quantity, remaining);
      if (take <= 0) continue;
      await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
      remaining -= take;
    }
    return delta + remaining;
  }

  const target = [...lots].reverse().find((l) => l.quantity > 0) ?? lots[lots.length - 1];
  if (target) {
    await tx.lot.update({ where: { id: target.id }, data: { quantity: { increment: delta } } });
    return delta;
  }
  const now = new Date();
  const code = await generateLotCode({ plantTypeCode: item.plantTypeCode, staffCode, stageCode: item.stageCode, date: now, client: tx });
  await tx.lot.create({
    data: {
      code,
      plantTypeId: item.plantTypeId,
      stage: "THANH_PHAM",
      stageCode: item.stageCode,
      roomId: item.roomId,
      quantity: delta,
      initialQuantity: delta,
      status: "ACTIVE",
      enteredAt: now,
    },
  });
  return delta;
}

