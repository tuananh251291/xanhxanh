import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { OrchidError, parseDateVN, allocateOrchidFifo, assertOrchidAvailable, ORCHID_CODE } from "@/lib/orchid/server";
import type { orchidPointEntrySchema, orchidTransferSchema } from "@/lib/orchid/schemas";

type Tx = Prisma.TransactionClient;
type Actor = { id: string; name: string };

// Bán / hỏng / báo tồn tại điểm bán — dùng chung cho tài khoản điểm bán và Admin cấp cao/NV Trợ lý nhập hộ.
export async function createOrchidPointEntry(tx: Tx, pointId: string, entry: z.infer<typeof orchidPointEntrySchema>, actor: Actor) {
  const base = { pointId, createdById: actor.id, createdByName: actor.name };
  if (entry.kind === "sale") {
    return tx.orchidRetailSale.create({
      data: { ...base, saleDate: parseDateVN(entry.date), quantity: entry.quantity, revenue: entry.revenue, invoiceNumber: entry.invoiceNumber || null, note: entry.note || null },
    });
  }
  if (entry.kind === "damage") {
    return tx.orchidRetailDamage.create({
      data: { ...base, damageDate: parseDateVN(entry.date), quantity: entry.quantity, reason: entry.reason, photoUrls: entry.photoUrls, note: entry.note || null },
    });
  }
  return tx.orchidRetailStockReport.create({
    data: { ...base, reportDate: parseDateVN(entry.date), remainingQuantity: entry.remainingQuantity, note: entry.note || null },
  });
}

// Tạo phiếu điều chuyển. TO_POINT: trừ lô FIFO ngay lúc tạo (hàng đã rời kho), điểm bán xác nhận nhận sau.
// FROM_POINT: hàng về kho trung tâm — nhận luôn, tạo lô mới (source POINT_RETURN) vào kho được chọn.
export async function createOrchidTransfer(tx: Tx, d: z.infer<typeof orchidTransferSchema>, actor: Actor) {
  const quantity = d.items.reduce((s, i) => s + i.quantity, 0);
  const transferDate = parseDateVN(d.transferDate);
  if (d.type === "FROM_POINT" && !d.warehouseId) throw new OrchidError("Chọn kho nhận hàng về");

  const transfer = await tx.orchidTransfer.create({
    data: {
      code: await ORCHID_CODE.transfer(tx),
      type: d.type,
      pointId: d.pointId,
      transferDate,
      quantity,
      deliveredBy: d.deliveredBy || null,
      receivedBy: d.receivedBy || null,
      warehouseId: d.type === "FROM_POINT" ? d.warehouseId : null,
      note: d.note || null,
      createdById: actor.id,
      createdByName: actor.name,
      ...(d.type === "FROM_POINT" ? { status: "RECEIVED" as const, receivedQuantity: quantity, receivedAt: new Date() } : {}),
    },
  });

  if (d.type === "TO_POINT") {
    await assertOrchidAvailable(tx, d.items);
    for (const item of d.items) {
      const allocations = await allocateOrchidFifo(tx, item.productId, item.quantity);
      await tx.orchidTransferItem.createMany({
        data: allocations.map((a) => ({ transferId: transfer.id, productId: item.productId, lotId: a.lotId, quantity: a.quantity })),
      });
    }
  } else {
    if (d.items.length > 0) {
      // Điểm bán không theo dõi tồn kho chi tiết theo sản phẩm (chỉ theo tổng) — không chặn trả vượt từng loại.
      const pointSummary = await tx.orchidTransfer.aggregate({ where: { pointId: d.pointId, type: "TO_POINT", status: "RECEIVED" }, _sum: { receivedQuantity: true } });
      if ((pointSummary._sum.receivedQuantity ?? 0) <= 0) throw new OrchidError("Điểm bán chưa nhận hàng nào để trả về");
    }
    for (const item of d.items) {
      const lot = await tx.orchidLot.create({
        data: {
          code: await ORCHID_CODE.lot(tx),
          productId: item.productId,
          warehouseId: d.warehouseId!,
          receivedDate: transferDate,
          quantityIn: item.quantity,
          quantityRemaining: item.quantity,
          source: "POINT_RETURN",
          note: `Hàng trả về từ điểm bán (phiếu ${transfer.code})`,
        },
      });
      await tx.orchidTransferItem.create({ data: { transferId: transfer.id, productId: item.productId, lotId: lot.id, quantity: item.quantity } });
    }
  }
  return transfer;
}

// Huỷ phiếu gửi điểm bán CHƯA nhận — hoàn lại đúng lô đã trừ.
export async function cancelOrchidTransfer(tx: Tx, transferId: string) {
  const transfer = await tx.orchidTransfer.findUniqueOrThrow({ where: { id: transferId }, include: { items: true } });
  if (transfer.type !== "TO_POINT" || transfer.status !== "PENDING") throw new OrchidError("Chỉ huỷ được phiếu gửi điểm bán đang chờ nhận");
  for (const item of transfer.items) {
    if (item.lotId) await tx.orchidLot.update({ where: { id: item.lotId }, data: { quantityRemaining: { increment: item.quantity } } });
  }
  await tx.orchidTransfer.update({ where: { id: transferId }, data: { status: "CANCELLED" } });
}

// Điểm bán (hoặc NV nhập hộ) xác nhận đã nhận — số thực nhận có thể ít hơn số gửi (thiếu/hỏng dọc đường).
export async function receiveOrchidTransfer(tx: Tx, transferId: string, pointId: string | null, receivedQuantity: number, receivedBy: string | null, note: string | null) {
  const transfer = await tx.orchidTransfer.findUniqueOrThrow({ where: { id: transferId } });
  if (pointId && transfer.pointId !== pointId) throw new OrchidError("Phiếu không thuộc điểm bán của bạn");
  if (transfer.type !== "TO_POINT" || transfer.status !== "PENDING") throw new OrchidError("Phiếu đã được xử lý");
  if (receivedQuantity < 0 || receivedQuantity > transfer.quantity) throw new OrchidError(`Số thực nhận phải từ 0 đến ${transfer.quantity}`);
  const shortage = transfer.quantity - receivedQuantity;
  await tx.orchidTransfer.update({
    where: { id: transferId },
    data: {
      status: "RECEIVED",
      receivedQuantity,
      receivedAt: new Date(),
      receivedBy: receivedBy || transfer.receivedBy,
      note: [transfer.note, shortage > 0 ? `Nhận thiếu ${shortage} cây` : null, note].filter(Boolean).join(" · ") || null,
    },
  });
}
