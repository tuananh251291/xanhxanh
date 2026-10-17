import { prisma } from "@/lib/prisma";
import { getQualifiedLots } from "@/lib/order-availability";
import { createAlert } from "@/lib/inventory";
import { isSerializationFailure } from "@/lib/prisma-errors";
import { ALL_FINISHED_STAGE_CODES } from "@/types";

// QL Kho thành phẩm / Admin cấp cao SỬA đơn chưa xuất (HELD/CONFIRMED) — kể cả khi đã phân công và NV đã
// nhặt hàng (nhặt hàng KHÔNG trừ tồn thực, xem OrderItem.pickedQuantity1-3, nên giảm số lượng không phải
// cộng ngược tồn — tồn đạt tiêu chuẩn tự tăng lại vì đơn giữ ít hơn; chỉ cảnh báo NV trả cây dư về vị trí).
// 3 loại dòng:
// - KHOÁ (không sửa/xoá): đã có Yêu cầu xử lý cây COMPLETED (tồn thực đã trừ theo túi đã mở) hoặc PENDING
//   mà đơn môi trường kèm theo đã hoàn thành.
// - Dòng xử lý (neededQuantity khác null, chưa khoá): chỉ GIỮ hoặc XOÁ — xoá thì huỷ luôn Yêu cầu xử lý +
//   đơn môi trường (PENDING), báo Kho TP + Môi trường. Không sửa số lượng (sẽ phải sinh yêu cầu tách túi mới).
// - Dòng thường: gộp theo (mã cây, quy cách), sửa số lượng/thêm/xoá. Tăng thì phải đủ tồn đạt tiêu chuẩn
//   ĐÚNG quy cách ở Phòng đạt tiêu chuẩn của kho (không tự sinh yêu cầu tách túi), thiếu thì chặn.
// Mỗi lần sửa báo NV bán hàng (trước/sau) và NV Kho TP đang được giao đơn (kèm cảnh báo nhặt dư).

export const ORDER_EDIT_STAGE_CODES: readonly string[] = ALL_FINISHED_STAGE_CODES;

export function canEditOrderItems(role: string | null | undefined): boolean {
  return role === "QUAN_LY_KHO_THANH_PHAM" || role === "SUPER_ADMIN";
}

export type OrderEditLine = { plantTypeId: string; stageCode: string; quantity: number };

export class OrderEditError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const groupKey = (plantTypeId: string, stageCode: string) => `${plantTypeId}:${stageCode}`;
const pickedTotal = (i: { pickedQuantity1: number; pickedQuantity2: number; pickedQuantity3: number }) =>
  i.pickedQuantity1 + i.pickedQuantity2 + i.pickedQuantity3;

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, code: true, status: true, saleId: true, assignedToId: true, updatedAt: true,
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true, lotId: true, quantity: true, neededQuantity: true,
          pickedQuantity1: true, pickedQuantity2: true, pickedQuantity3: true,
          lot: { select: { id: true, roomId: true, stageCode: true, plantTypeId: true, plantType: { select: { code: true, name: true } }, room: { select: { warehouseId: true, type: true } } } },
          processingRequest: { select: { id: true, code: true, status: true, mediumOrder: { select: { id: true, code: true, status: true } } } },
        },
      },
    },
  });
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
type LoadedItem = LoadedOrder["items"][number];

export function classifyOrderItem(item: Pick<LoadedItem, "neededQuantity" | "processingRequest">): "locked" | "processing" | "regular" {
  const pr = item.processingRequest;
  if (pr?.status === "COMPLETED") return "locked";
  if (pr?.status === "PENDING" && pr.mediumOrder?.status === "COMPLETED") return "locked";
  if (item.neededQuantity !== null || pr) return "processing";
  return "regular";
}

// Dữ liệu cho hộp thoại "Sửa đơn" — tách sẵn 3 loại dòng.
export async function getOrderEditData(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order) return null;
  const locked: { id: string; plantCode: string; plantName: string; stageCode: string; quantity: number; reason: string }[] = [];
  const processing: { id: string; plantCode: string; plantName: string; stageCode: string; quantity: number; prCode: string | null }[] = [];
  const regular = new Map<string, { plantTypeId: string; plantCode: string; plantName: string; stageCode: string; quantity: number; picked: number }>();
  for (const i of order.items) {
    const kind = classifyOrderItem(i);
    const base = { plantCode: i.lot.plantType.code, plantName: i.lot.plantType.name, stageCode: i.lot.stageCode };
    if (kind === "locked") {
      locked.push({
        id: i.id, ...base, quantity: i.neededQuantity ?? i.quantity,
        reason: i.processingRequest?.status === "COMPLETED" ? "Đã hoàn thành xử lý cây" : "Đơn môi trường đã hoàn thành",
      });
    } else if (kind === "processing") {
      processing.push({ id: i.id, ...base, quantity: i.neededQuantity ?? i.quantity, prCode: i.processingRequest?.code ?? null });
    } else {
      const key = groupKey(i.lot.plantTypeId, i.lot.stageCode);
      const g = regular.get(key) ?? { plantTypeId: i.lot.plantTypeId, ...base, quantity: 0, picked: 0 };
      g.quantity += i.quantity;
      g.picked += pickedTotal(i);
      regular.set(key, g);
    }
  }
  return { order: { id: order.id, code: order.code, status: order.status }, locked, processing, regular: [...regular.values()] };
}

export async function editOrderItems(params: {
  orderId: string;
  user: { id: string; name: string; role: string | null; workplaceWarehouseId: string | null };
  lines: OrderEditLine[];
  removeItemIds: string[];
}) {
  const { orderId, user, lines, removeItemIds } = params;
  if (!canEditOrderItems(user.role)) throw new OrderEditError("Chỉ Quản lý kho thành phẩm / Admin cấp cao được sửa đơn hàng", 403);

  const order = await loadOrder(orderId);
  if (!order) throw new OrderEditError("Không tìm thấy đơn hàng", 404);
  if (order.status !== "HELD" && order.status !== "CONFIRMED") throw new OrderEditError("Chỉ sửa được đơn Đang giữ/Đã xác nhận (chưa xuất kho)");

  // Kho thành phẩm của đơn = kho chứa các lô đang giữ — QL kho chỉ sửa đơn thuộc đúng kho mình làm việc.
  // (bỏ qua Phòng thị trường đã cấp quyền — thuộc Kho thị trường, không phải kho thành phẩm của đơn).
  const warehouseIds = [...new Set(order.items.filter((i) => i.lot.room?.type !== "PHONG_THI_TRUONG").map((i) => i.lot.room?.warehouseId).filter((w): w is string => !!w))];
  const warehouseId = warehouseIds[0] ?? user.workplaceWarehouseId;
  if (!warehouseId) throw new OrderEditError("Không xác định được kho thành phẩm của đơn");
  if (user.role === "QUAN_LY_KHO_THANH_PHAM" && !warehouseIds.every((w) => w === user.workplaceWarehouseId) && warehouseIds.length > 0) {
    throw new OrderEditError("Đơn này thuộc kho thành phẩm khác — không đúng địa điểm làm việc của bạn", 403);
  }

  // Kiểm tra dữ liệu gửi lên
  const seen = new Set<string>();
  for (const l of lines) {
    if (!ORDER_EDIT_STAGE_CODES.includes(l.stageCode)) throw new OrderEditError(`Quy cách "${l.stageCode}" không hợp lệ`);
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new OrderEditError("Số lượng phải là số nguyên dương");
    const key = groupKey(l.plantTypeId, l.stageCode);
    if (seen.has(key)) throw new OrderEditError("Trùng dòng mã cây + quy cách — gộp lại thành 1 dòng");
    seen.add(key);
  }
  const itemById = new Map(order.items.map((i) => [i.id, i]));
  for (const id of removeItemIds) {
    const it = itemById.get(id);
    if (!it || classifyOrderItem(it) !== "processing") throw new OrderEditError("Chỉ xoá được dòng xử lý cây chưa hoàn thành");
  }

  const regularItems = order.items.filter((i) => classifyOrderItem(i) === "regular");
  const keptOther = order.items.filter((i) => classifyOrderItem(i) !== "regular" && !removeItemIds.includes(i.id));
  if (lines.length === 0 && keptOther.length === 0) throw new OrderEditError("Đơn phải còn ít nhất 1 dòng — muốn bỏ cả đơn thì dùng Huỷ đơn");

  const plantTypes = await prisma.plantType.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.plantTypeId))] } }, select: { id: true, code: true } });
  const plantCodeById = new Map(plantTypes.map((p) => [p.id, p.code]));
  for (const p of order.items) plantCodeById.set(p.lot.plantTypeId, p.lot.plantType.code);
  if (lines.some((l) => !plantCodeById.has(l.plantTypeId))) throw new OrderEditError("Mã cây không hợp lệ");

  const datRooms = await prisma.room.findMany({ where: { warehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true }, select: { id: true } });
  // Lô của dòng thường hiện có (VD Phòng thị trường đã cấp quyền) vẫn được lấy thêm — cùng phạm vi lúc tạo đơn.
  const searchRoomIds = [...new Set([...datRooms.map((r) => r.id), ...regularItems.map((i) => i.lot.roomId).filter((r): r is string => !!r)])];

  // Gộp dòng thường hiện có theo (mã cây, quy cách)
  const currentByKey = new Map<string, LoadedItem[]>();
  for (const i of regularItems) {
    const key = groupKey(i.lot.plantTypeId, i.lot.stageCode);
    currentByKey.set(key, [...(currentByKey.get(key) ?? []), i]);
  }
  const desiredByKey = new Map(lines.map((l) => [groupKey(l.plantTypeId, l.stageCode), l]));
  const changes: { label: string; before: number; after: number }[] = [];
  for (const key of new Set([...currentByKey.keys(), ...desiredByKey.keys()])) {
    const before = (currentByKey.get(key) ?? []).reduce((s, i) => s + i.quantity, 0);
    const after = desiredByKey.get(key)?.quantity ?? 0;
    if (before !== after) {
      const [plantTypeId, stageCode] = key.split(":");
      changes.push({ label: `${plantCodeById.get(plantTypeId)} ${stageCode}`, before, after });
    }
  }
  const removedProcessing = removeItemIds.map((id) => itemById.get(id)!);
  if (changes.length === 0 && removedProcessing.length === 0) throw new OrderEditError("Không có thay đổi nào");

  const pickWarnings: string[] = [];
  try {
    await prisma.$transaction(
      async (tx) => {
        // Khoá đơn theo trạng thái + updatedAt: Sale xác nhận/huỷ, NV xuất kho hoặc người khác vừa sửa → chặn.
        const locked = await tx.order.updateMany({ where: { id: order.id, status: order.status, updatedAt: order.updatedAt }, data: { updatedAt: new Date() } });
        if (locked.count === 0) throw new OrderEditError("Đơn vừa được thay đổi bởi thao tác khác — tải lại trang rồi sửa lại", 409);

        for (const it of removedProcessing) {
          const pr = it.processingRequest;
          if (pr) {
            if (pr.mediumOrder) await tx.processingMediumOrder.delete({ where: { id: pr.mediumOrder.id } });
            await tx.orderProcessingRequest.delete({ where: { id: pr.id } });
          }
          await tx.orderItem.delete({ where: { id: it.id } });
        }

        for (const key of new Set([...currentByKey.keys(), ...desiredByKey.keys()])) {
          const items = currentByKey.get(key) ?? [];
          const before = items.reduce((s, i) => s + i.quantity, 0);
          const after = desiredByKey.get(key)?.quantity ?? 0;
          if (before === after) continue;
          const [plantTypeId, stageCode] = key.split(":");
          const label = `${plantCodeById.get(plantTypeId)} ${stageCode}`;

          if (after < before) {
            // Giảm: bớt từ dòng ít đã nhặt nhất trước, dòng về 0 thì xoá.
            let reduce = before - after;
            for (const it of [...items].sort((a, b) => pickedTotal(a) - pickedTotal(b))) {
              if (reduce <= 0) break;
              const take = Math.min(it.quantity, reduce);
              const newQty = it.quantity - take;
              if (newQty === 0) await tx.orderItem.delete({ where: { id: it.id } });
              else await tx.orderItem.update({ where: { id: it.id }, data: { quantity: newQty } });
              const over = pickedTotal(it) - newQty;
              if (over > 0) pickWarnings.push(`${label}: đã nhặt dư ${over.toLocaleString("vi-VN")} cây — cần trả lại vị trí`);
              reduce -= take;
            }
            continue;
          }

          // Tăng/thêm: lấy từ tồn đạt tiêu chuẩn ĐÚNG quy cách (đã trừ mọi đơn đang giữ, kể cả đơn này).
          let extra = after - before;
          const lots = await getQualifiedLots(searchRoomIds, plantTypeId, stageCode, tx);
          const available = lots.reduce((s, l) => s + l.available, 0);
          if (available < extra) {
            throw new OrderEditError(`${label}: tồn đạt tiêu chuẩn chỉ còn ${available.toLocaleString("vi-VN")} cây, cần thêm ${extra.toLocaleString("vi-VN")} cây`);
          }
          const itemByLot = new Map(items.map((i) => [i.lotId, i]));
          // Ưu tiên lô đơn đang dùng sẵn (cộng vào dòng có sẵn), sau đó lô khác theo thứ tự nhập kho.
          for (const lot of [...lots].sort((a, b) => Number(itemByLot.has(b.id)) - Number(itemByLot.has(a.id)))) {
            if (extra <= 0) break;
            const take = Math.min(lot.available, extra);
            if (take <= 0) continue;
            const existing = itemByLot.get(lot.id);
            if (existing) await tx.orderItem.update({ where: { id: existing.id }, data: { quantity: { increment: take } } });
            else await tx.orderItem.create({ data: { orderId: order.id, lotId: lot.id, quantity: take } });
            extra -= take;
          }
        }
      },
      { isolationLevel: "Serializable", timeout: 30000, maxWait: 10000 }
    );
  } catch (err) {
    if (isSerializationFailure(err)) throw new OrderEditError("Có người khác vừa giữ/sửa tồn cùng lúc — vui lòng thử lại", 409);
    throw err;
  }

  // Thông báo
  const changeText = [
    ...changes.map((c) => (c.before === 0 ? `thêm ${c.label}: ${c.after}` : c.after === 0 ? `xoá ${c.label} (${c.before})` : `${c.label}: ${c.before} → ${c.after}`)),
    ...removedProcessing.map((i) => `xoá dòng xử lý ${i.lot.plantType.code} ${i.lot.stageCode} (${i.neededQuantity ?? i.quantity})`),
  ].join("; ");
  await createAlert({
    type: "ORDER_EDITED",
    title: `Đơn ${order.code} đã được sửa`,
    message: `${user.name} (Kho thành phẩm) đã sửa đơn ${order.code}: ${changeText}.`,
    userId: order.saleId,
    relatedId: order.id,
    relatedType: "Order",
  });
  if (order.assignedToId) {
    await createAlert({
      type: "ORDER_PENDING_PACK",
      title: `Đơn ${order.code} đã được sửa — kiểm tra lại nhặt hàng`,
      message: `${changeText}.${pickWarnings.length ? ` Lưu ý: ${pickWarnings.join("; ")}.` : ""}`,
      userId: order.assignedToId,
      relatedId: order.id,
      relatedType: "Order",
    });
  }
  const cancelledPr = removedProcessing.map((i) => i.processingRequest).filter((p): p is NonNullable<typeof p> => !!p);
  if (cancelledPr.length > 0) {
    const prText = cancelledPr.map((p) => `${p.code}${p.mediumOrder ? ` (đơn môi trường ${p.mediumOrder.code})` : ""}`).join(", ");
    await createAlert({
      type: "ORDER_PENDING_PACK",
      title: `Huỷ yêu cầu xử lý cây của đơn ${order.code}`,
      message: `Đơn ${order.code} được sửa — đã huỷ yêu cầu xử lý cây ${prText}, không cần xử lý nữa.`,
      targetRole: "KHO_THANH_PHAM",
      relatedId: order.id,
      relatedType: "Order",
    });
    const mediumCodes = cancelledPr.map((p) => p.mediumOrder?.code).filter(Boolean);
    if (mediumCodes.length > 0) {
      await createAlert({
        type: "MEDIUM_ORDER_CREATED",
        title: `Huỷ đơn môi trường ${mediumCodes.join(", ")}`,
        message: `Đơn hàng ${order.code} đã được sửa — đơn môi trường ${mediumCodes.join(", ")} không còn cần nữa, đã huỷ.`,
        targetRole: "MOI_TRUONG",
        relatedId: order.id,
        relatedType: "Order",
      });
    }
  }

  return { changes, removedProcessing: removedProcessing.length, pickWarnings };
}
