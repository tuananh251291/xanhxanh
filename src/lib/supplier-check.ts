import { addDays, addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { createAlert, getSystemConfig } from "@/lib/inventory";
import { createPlannedGoodsReceipt } from "@/lib/goods-receipt";
import { getShipCutoffKey, toVnDateKey } from "@/lib/finished-stock-forecast";
import { notifySupplier, notifySupplierCheckManagers } from "@/lib/supplier-check-notify";
import type { Prisma, UserRole } from "@prisma/client";

// Đơn thiếu hàng: phần thiếu lưu ở OrderShortage (không giữ chỗ tồn). QL Kho TP gửi Đơn kiểm tra cho NCC → NCC báo số đáp
// ứng + giữ hàng → QL gửi kết quả cho Sale (hạn giữ đơn bắt đầu từ đây) → khách cọc → QL đổi thành Đặt hàng: tạo Phiếu
// dự kiến nhập (A3) + dòng đơn chưa có lô (A4) cùng lúc, nên tồn dự kiến không bị âm giả → NCC giao theo phiếu, số thực
// tế thay số đã xác nhận.
type Client = Prisma.TransactionClient | typeof prisma;

export class SupplierCheckError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const canManageSupplierChecks = (role: UserRole | null | undefined) => role === "QUAN_LY_KHO_THANH_PHAM" || role === "SUPER_ADMIN";

// Trạng thái còn "chiếm" phần thiếu — không được gửi NCC khác trùng số lượng này.
export const ACTIVE_CHECK_STATUSES = ["PENDING", "CONFIRMED", "PLACED", "DELIVERED"] as const;

export const orderHasOpenShortage = (order: { supplyResultSentAt: Date | null; _count: { shortages: number } }) =>
  order._count.shortages > 0 && !order.supplyResultSentAt;

// Hạn trả lời: cùng giờ của ngày làm việc kế tiếp (bỏ Chủ nhật + ngày lễ).
export async function nextWorkingDeadline(from: Date): Promise<Date> {
  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: from, lte: addDays(from, 40) } },
    select: { date: true },
  });
  const holidayKeys = new Set(holidays.map((h) => toVnDateKey(h.date)));
  let next = addDays(from, 1);
  while (new Date(next.getTime() + 7 * 3_600_000).getUTCDay() === 0 || holidayKeys.has(toVnDateKey(next))) next = addDays(next, 1);
  return next;
}

async function generateCheckCode(client: Client): Promise<string> {
  const today = new Date();
  const prefix = `DKT-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await client.supplierCheck.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" } });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export async function createSupplierCheck(params: {
  orderId: string;
  supplierId: string;
  deliveryDateKey: string;
  items: { plantTypeId: string; stageCode: string; quantity: number }[];
  userId: string;
}) {
  const { orderId, supplierId, deliveryDateKey, items, userId } = params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true, expectedShipAt: true, supplyResultSentAt: true,
      shortages: { select: { plantTypeId: true, stageCode: true, quantity: true } },
      supplierChecks: { where: { status: { in: [...ACTIVE_CHECK_STATUSES] } }, select: { status: true, items: { select: { plantTypeId: true, stageCode: true, requestedQuantity: true, confirmedQuantity: true } } } },
    },
  });
  if (!order) throw new SupplierCheckError("Không tìm thấy đơn hàng", 404);
  if (order.status !== "HELD" || order.supplyResultSentAt) throw new SupplierCheckError("Đơn đã gửi kết quả cho NV bán hàng hoặc không còn tạm giữ");
  if (!order.expectedShipAt) throw new SupplierCheckError("Đơn chưa có ngày xuất");
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, isActive: true }, select: { id: true, userId: true } });
  if (!supplier) throw new SupplierCheckError("Nhà cung cấp không hợp lệ");

  const latestKey = await getShipCutoffKey(order.expectedShipAt);
  if (deliveryDateKey > latestKey) throw new SupplierCheckError(`Ngày giao phải trước ngày xuất 2 ngày làm việc (muộn nhất ${latestKey.split("-").reverse().join("/")})`);
  if (deliveryDateKey < toVnDateKey(new Date())) throw new SupplierCheckError("Ngày giao đã qua");

  const key = (i: { plantTypeId: string; stageCode: string }) => `${i.plantTypeId}:${i.stageCode}`;
  const left = new Map(order.shortages.map((s) => [key(s), s.quantity]));
  for (const check of order.supplierChecks) {
    for (const i of check.items) left.set(key(i), (left.get(key(i)) ?? 0) - (check.status === "PENDING" ? i.requestedQuantity : i.confirmedQuantity ?? 0));
  }
  const lines = items.filter((i) => i.quantity > 0);
  if (lines.length === 0) throw new SupplierCheckError("Chưa có số lượng cần kiểm tra");
  for (const line of lines) {
    if (line.quantity > (left.get(key(line)) ?? 0)) throw new SupplierCheckError("Số lượng vượt phần còn thiếu của đơn — tải lại trang");
  }

  const deadline = await nextWorkingDeadline(new Date());
  const check = await prisma.$transaction(async (tx) =>
    tx.supplierCheck.create({
      data: {
        code: await generateCheckCode(tx),
        orderId,
        supplierId,
        deliveryDate: new Date(`${deliveryDateKey}T00:00:00+07:00`),
        responseDeadline: deadline,
        sentById: userId,
        items: { create: lines.map((l) => ({ plantTypeId: l.plantTypeId, stageCode: l.stageCode, requestedQuantity: l.quantity })) },
      },
    })
  );
  const totalRequested = lines.reduce((s, l) => s + l.quantity, 0);
  await notifySupplier(
    supplier.userId,
    `Đơn kiểm tra mới ${check.code}`,
    `Cần xác nhận ${totalRequested.toLocaleString("vi-VN")} cây, giao ngày ${deliveryDateKey.split("-").reverse().join("/")}. Hạn xác nhận ${deadline.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`,
    check.id
  );
  return check;
}

const loadCheck = (id: string) =>
  prisma.supplierCheck.findUnique({
    where: { id },
    include: {
      items: { include: { plantType: { select: { code: true } } } },
      supplier: { select: { name: true, userId: true } },
      order: { select: { id: true, code: true, status: true, saleId: true } },
    },
  });

type QuantityInput = { id: string; quantity: number }[];

const quantityOf = (input: QuantityInput, itemId: string) => {
  const quantity = input.find((i) => i.id === itemId)?.quantity;
  if (quantity === undefined || !Number.isInteger(quantity) || quantity < 0) throw new SupplierCheckError("Số lượng từng loại cây phải là số nguyên không âm");
  return quantity;
};

// NCC trả lời số đáp ứng từng loại cây (hoặc QL Kho TP nhập hộ NCC chưa có tài khoản).
export async function respondSupplierCheck(checkId: string, input: QuantityInput, opts: { proxy: boolean }) {
  const check = await loadCheck(checkId);
  if (!check) throw new SupplierCheckError("Không tìm thấy Đơn kiểm tra", 404);
  if (check.status !== "PENDING") throw new SupplierCheckError("Đơn kiểm tra đã được trả lời hoặc đã hết hạn");
  if (opts.proxy && check.supplier.userId) throw new SupplierCheckError("NCC này đã có tài khoản — NCC tự xác nhận");

  const confirmed = check.items.map((item) => {
    const quantity = quantityOf(input, item.id);
    if (quantity > item.requestedQuantity) throw new SupplierCheckError(`${item.plantType.code} ${item.stageCode}: chỉ được yêu cầu ${item.requestedQuantity.toLocaleString("vi-VN")} cây`);
    return { id: item.id, quantity };
  });
  const total = confirmed.reduce((s, c) => s + c.quantity, 0);
  await prisma.$transaction([
    ...confirmed.map((c) => prisma.supplierCheckItem.update({ where: { id: c.id }, data: { confirmedQuantity: c.quantity } })),
    prisma.supplierCheck.update({
      where: { id: check.id },
      data: { status: total > 0 ? "CONFIRMED" : "DECLINED", respondedAt: new Date(), respondedByProxy: opts.proxy },
    }),
  ]);
  await notifySupplierCheckManagers(
    `${check.supplier.name} đã trả lời ${check.code}`,
    `Đơn ${check.order.code}: NCC ${total > 0 ? `có thể đáp ứng ${total.toLocaleString("vi-VN")} cây` : "không đáp ứng được"} — xem trang Kiểm tra NCC`,
    check.id
  );
}

// Khách đã cọc → Đặt hàng: tạo Phiếu dự kiến nhập + dòng đơn chưa có lô trong cùng 1 transaction.
export async function placeSupplierCheck(checkId: string, user: { id: string; code: string; workplaceWarehouseId: string | null }) {
  const check = await loadCheck(checkId);
  if (!check) throw new SupplierCheckError("Không tìm thấy Đơn kiểm tra", 404);
  if (check.status !== "CONFIRMED") throw new SupplierCheckError("Chỉ đặt hàng được Đơn kiểm tra NCC đã xác nhận");
  if (check.order.status !== "CONFIRMED") throw new SupplierCheckError("Khách chưa cọc — chưa đặt hàng được");
  if (!user.workplaceWarehouseId) throw new SupplierCheckError("Tài khoản chưa được gán kho thành phẩm làm việc");
  const room = await prisma.room.findFirst({ where: { warehouseId: user.workplaceWarehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true }, select: { id: true } });
  if (!room) throw new SupplierCheckError("Kho chưa có Phòng đạt tiêu chuẩn");

  const lines = check.items.filter((i) => (i.confirmedQuantity ?? 0) > 0);
  await prisma.$transaction(async (tx) => {
    const receipt = await createPlannedGoodsReceipt(tx, {
      supplierId: check.supplierId,
      roomId: room.id,
      createdById: user.id,
      notes: `Đặt hàng theo ${check.code} — đơn ${check.order.code}`,
      expectedDate: check.deliveryDate,
      items: lines.map((i) => ({ plantTypeId: i.plantTypeId, plantTypeCode: i.plantType.code, stageCode: i.stageCode, estimatedQuantity: i.confirmedQuantity! })),
      staffCode: user.code,
    });
    await tx.orderItem.createMany({
      data: lines.map((i) => ({ orderId: check.orderId, plantTypeId: i.plantTypeId, stageCode: i.stageCode, quantity: i.confirmedQuantity! })),
    });
    await tx.supplierCheck.update({ where: { id: check.id }, data: { status: "PLACED", placedAt: new Date(), goodsReceiptId: receipt.id } });
  }, { timeout: 30000, maxWait: 10000 });
  await notifySupplier(
    check.supplier.userId,
    `${check.code} đã được đặt hàng`,
    `Giao ${lines.reduce((s, i) => s + (i.confirmedQuantity ?? 0), 0).toLocaleString("vi-VN")} cây vào ngày ${toVnDateKey(check.deliveryDate).split("-").reverse().join("/")}, nhập phiếu giao khi giao hàng.`,
    check.id
  );
}

// NCC giao theo phiếu: số thực tế thay số đã xác nhận trong Phiếu dự kiến nhập. Kho TP vẫn nhận hàng ở trang Nhận hàng.
export async function deliverSupplierCheck(checkId: string, input: QuantityInput, opts: { proxy: boolean }) {
  const check = await loadCheck(checkId);
  if (!check) throw new SupplierCheckError("Không tìm thấy Đơn kiểm tra", 404);
  if (check.status !== "PLACED" || !check.goodsReceiptId) throw new SupplierCheckError("Đơn này chưa ở bước giao hàng");
  if (opts.proxy && check.supplier.userId) throw new SupplierCheckError("NCC này đã có tài khoản — NCC tự nhập phiếu giao");
  const receiptItems = await prisma.goodsReceiptItem.findMany({
    where: { receiptId: check.goodsReceiptId },
    select: { id: true, plantTypeId: true, stageCode: true, plannedLotId: true },
  });

  const lines = check.items.filter((i) => (i.confirmedQuantity ?? 0) > 0);
  const delivered = lines.map((item) => ({ item, quantity: quantityOf(input, item.id) }));
  await prisma.$transaction(async (tx) => {
    for (const { item, quantity } of delivered) {
      await tx.supplierCheckItem.update({ where: { id: item.id }, data: { deliveredQuantity: quantity } });
      const receiptItem = receiptItems.find((r) => r.plantTypeId === item.plantTypeId && r.stageCode === item.stageCode);
      if (!receiptItem) continue;
      await tx.goodsReceiptItem.update({ where: { id: receiptItem.id }, data: { quantityDelivered: quantity, quantityPassed: quantity } });
      if (receiptItem.plannedLotId) await tx.lot.update({ where: { id: receiptItem.plannedLotId }, data: { quantity, initialQuantity: quantity } });
    }
    await tx.supplierCheck.update({ where: { id: check.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  });
  const short = delivered.filter(({ item, quantity }) => quantity < (item.confirmedQuantity ?? 0));
  await notifySupplierCheckManagers(
    `${check.supplier.name} đã giao theo ${check.code}`,
    short.length > 0
      ? `Đơn ${check.order.code}: giao thiếu ${short.map(({ item, quantity }) => `${item.plantType.code} ${item.stageCode} (${quantity}/${item.confirmedQuantity})`).join(", ")} — xác nhận ở trang Nhận hàng`
      : `Đơn ${check.order.code}: đã giao đủ — xác nhận ở trang Nhận hàng`,
    check.id
  );
}

// QL Kho TP gửi kết quả cho Sale: hạn giữ đơn bắt đầu tính từ đây, Sale mới bấm được Khách đã cọc.
export async function sendSupplyResult(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, code: true, status: true, saleId: true, supplyResultSentAt: true,
      sale: { select: { holdDays: true } },
      customer: { select: { customerGroup: true } },
      shortages: { select: { quantity: true } },
      supplierChecks: { select: { status: true, items: { select: { confirmedQuantity: true } } } },
    },
  });
  if (!order) throw new SupplierCheckError("Không tìm thấy đơn hàng", 404);
  if (order.status !== "HELD" || order.supplyResultSentAt) throw new SupplierCheckError("Đơn đã gửi kết quả hoặc không còn tạm giữ");
  if (order.shortages.length === 0) throw new SupplierCheckError("Đơn không thiếu hàng");
  if (order.supplierChecks.some((c) => c.status === "PENDING")) throw new SupplierCheckError("Còn NCC chưa trả lời");

  const shortage = order.shortages.reduce((s, x) => s + x.quantity, 0);
  const confirmed = order.supplierChecks
    .filter((c) => c.status === "CONFIRMED")
    .flatMap((c) => c.items)
    .reduce((s, i) => s + (i.confirmedQuantity ?? 0), 0);
  const now = new Date();
  const defaultHoldDays = parseInt(await getSystemConfig("default_hold_days", "3"), 10) || 3;
  const holdUntil = order.customer?.customerGroup === "KHACH_CONG_TY_LON" ? addMonths(now, 5) : addDays(now, order.sale.holdDays ?? defaultHoldDays);
  await prisma.order.update({ where: { id: order.id }, data: { supplyResultSentAt: now, holdUntil } });
  const missing = shortage - confirmed;
  await createAlert({
    type: "ORDER_EDITED",
    title: `Đơn ${order.code}: đã có kết quả kiểm tra NCC`,
    message: `NCC đáp ứng ${confirmed.toLocaleString("vi-VN")}/${shortage.toLocaleString("vi-VN")} cây còn thiếu${missing > 0 ? `, vẫn thiếu ${missing.toLocaleString("vi-VN")} cây` : ""}. Đơn được giữ tới khi hết hạn — bấm Khách đã cọc khi khách đặt cọc.`,
    userId: order.saleId,
    relatedId: order.id,
    relatedType: "Order",
  });
}

// Không có cron — gọi khi QL Kho TP vào hệ thống, cùng kiểu ensureExpiredOrdersCancelled. NCC quá hạn coi như không đáp
// ứng; QL chưa gửi NCC quá 1 ngày làm việc thì nhắc QL và báo Sale. Không đơn nào tự huỷ vì lý do này.
export async function ensureSupplierCheckDeadlines(now: Date = new Date()) {
  const expired = await prisma.supplierCheck.findMany({
    where: { status: "PENDING", responseDeadline: { lt: now } },
    select: { id: true, code: true, supplier: { select: { name: true, userId: true } }, order: { select: { code: true } } },
  });
  if (expired.length > 0) {
    await prisma.supplierCheck.updateMany({ where: { id: { in: expired.map((e) => e.id) } }, data: { status: "EXPIRED" } });
    for (const e of expired) {
      await notifySupplierCheckManagers(`${e.supplier.name} quá hạn trả lời ${e.code}`, `Đơn ${e.order.code}: coi như NCC không đáp ứng — chọn NCC khác hoặc gửi kết quả cho NV bán hàng`, e.id);
      await notifySupplier(e.supplier.userId, `${e.code} đã quá hạn xác nhận`, "Đơn kiểm tra đã hết hiệu lực, không cần giữ hàng cho đơn này.", e.id);
    }
  }

  const waiting = await prisma.order.findMany({
    where: { status: "HELD", supplyResultSentAt: null, shortages: { some: {} }, supplierChecks: { none: {} } },
    select: { id: true, code: true, saleId: true, createdAt: true },
  });
  for (const order of waiting) {
    if ((await nextWorkingDeadline(order.createdAt)) > now) continue;
    const already = await prisma.alert.findFirst({ where: { type: "SUPPLIER_CHECK_UPDATE", relatedId: order.id, relatedType: "OrderShortageOverdue" }, select: { id: true } });
    if (already) continue;
    await notifySupplierCheckManagers(`Đơn ${order.code} thiếu hàng chưa gửi NCC`, "Đã quá 1 ngày làm việc — vào trang Kiểm tra NCC để gửi Đơn kiểm tra", order.id, "OrderShortageOverdue");
    await createAlert({ type: "ORDER_EDITED", title: `Đơn ${order.code} đang chờ QL Kho TP kiểm tra NCC`, message: "Quản lý kho thành phẩm chưa gửi kiểm tra NCC trong hạn 1 ngày làm việc — đã nhắc Quản lý.", userId: order.saleId, relatedId: order.id, relatedType: "Order" });
  }
}
