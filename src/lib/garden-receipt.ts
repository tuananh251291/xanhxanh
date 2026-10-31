import type { GardenOrderType, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isGardenAdmin } from "@/types";
import { getMovableLots, type MovableLot } from "@/lib/room-move";

type Client = Prisma.TransactionClient | typeof prisma;

// "Nhận bàn giao cây mô" về Vườn sản xuất — xem model GardenReceipt (schema.prisma).

export { GARDEN_RECEIPT_STATUS_LABELS } from "@/lib/garden-receipt-constants";

// Bên giao: Kho thành phẩm (QL/NV kho TP) hoặc Khu sản xuất (Kho mô) — theo kho làm việc của người lập phiếu.
export type GardenReceiptSender = { warehouseId: string; warehouseName: string; kind: "KTP" | "SX" };

export async function getGardenReceiptSender(user: { role: UserRole | null | undefined; workplaceWarehouseId?: string | null }): Promise<GardenReceiptSender | null> {
  if (!user.workplaceWarehouseId) return null;
  const isKtpRole = user.role === "QUAN_LY_KHO_THANH_PHAM" || user.role === "KHO_THANH_PHAM";
  if (!isKtpRole && user.role !== "KHO_MO") return null;
  const wh = await prisma.warehouse.findUnique({ where: { id: user.workplaceWarehouseId }, select: { id: true, name: true, type: true, isRnd: true } });
  if (!wh) return null;
  if (isKtpRole && wh.type === "THANH_PHAM") return { warehouseId: wh.id, warehouseName: wh.name, kind: "KTP" };
  if (user.role === "KHO_MO" && wh.type === "SAN_XUAT" && !wh.isRnd) return { warehouseId: wh.id, warehouseName: wh.name, kind: "SX" };
  return null;
}

// Phòng nguồn được chọn ở Kho thành phẩm.
export async function getKtpSourceRooms(warehouseId: string, client: Client = prisma) {
  return client.room.findMany({
    where: { warehouseId, isActive: true, type: { in: ["PHONG_DAT_TIEU_CHUAN", "PHONG_CHO_XU_LY"] } },
    select: { id: true, name: true, type: true },
    orderBy: { type: "asc" },
  });
}

// Thành phẩm còn giao được ở Phòng ra rễ của 1 khu sản xuất, FIFO — trừ phần đang nằm trong phiếu bàn giao
// PENDING (lô đó chỉ bị trừ khi bên nhận xác nhận, nên đang "giữ chỗ").
export async function getRootingMovableLots(warehouseId: string, client: Client = prisma): Promise<MovableLot[]> {
  const lots = await client.lot.findMany({
    where: { status: "ACTIVE", stage: "THANH_PHAM", quantity: { gt: 0 }, shelf: { warehouseId, room: { type: "PHONG_RA_RE" } } },
    orderBy: { enteredAt: "asc" },
    select: {
      id: true, plantTypeId: true, stageCode: true, quantity: true,
      transferItems: { where: { transfer: { status: "PENDING" } }, select: { quantity: true } },
    },
  });
  return lots
    .map((l) => ({ id: l.id, plantTypeId: l.plantTypeId, stageCode: l.stageCode, available: l.quantity - l.transferItems.reduce((s, i) => s + i.quantity, 0) }))
    .filter((l) => l.available > 0);
}

// Lô còn giao được theo bên giao (Kho TP: đúng phòng đã chọn — dùng chung getMovableLots của Luân chuyển nội
// bộ, đã trừ phần đơn hàng/Phiếu xử lý đang giữ; Khu sản xuất: Phòng ra rễ).
export async function getSenderMovableLots(sender: GardenReceiptSender, roomId: string | null, client: Client = prisma): Promise<MovableLot[]> {
  if (sender.kind === "SX") return getRootingMovableLots(sender.warehouseId, client);
  if (!roomId) return [];
  const room = await client.room.findFirst({ where: { id: roomId, warehouseId: sender.warehouseId, isActive: true, type: { in: ["PHONG_DAT_TIEU_CHUAN", "PHONG_CHO_XU_LY"] } }, select: { type: true } });
  if (!room) return [];
  return getMovableLots(roomId, room.type === "PHONG_DAT_TIEU_CHUAN", client);
}

// pool = kho trong vườn theo loại lệnh của phiếu bàn giao: CONTAMINATED → Kho nhiễm, PLANNED → Kho cây trồng.
export async function addGardenStock(tx: Prisma.TransactionClient, gardenId: string, pool: GardenOrderType, plantTypeId: string, stageCode: string, quantity: number) {
  if (quantity <= 0) return;
  await tx.gardenStock.upsert({
    where: { gardenId_pool_plantTypeId_stageCode: { gardenId, pool, plantTypeId, stageCode } },
    create: { gardenId, pool, plantTypeId, stageCode, quantity },
    update: { quantity: { increment: quantity } },
  });
}

// Ai được xem 1 phiếu: Quản lý vườn của vườn nhận, người ở kho bên giao (cùng kho làm việc), Admin.
export async function canViewGardenReceipt(
  user: { id: string; role: UserRole | null | undefined; workplaceWarehouseId?: string | null },
  receipt: { fromWarehouseId: string; garden: { managerId: string | null } }
): Promise<boolean> {
  if (isGardenAdmin(user.role)) return true;
  if (user.role === "NHAN_VIEN_QUAN_LY_VUON" && receipt.garden.managerId === user.id) return true;
  return !!user.workplaceWarehouseId && user.workplaceWarehouseId === receipt.fromWarehouseId;
}

// Người nhận thông báo lệch: QL kho TP (phiếu từ Kho TP) hoặc Kho mô (phiếu từ Khu sản xuất) của đúng kho giao,
// người lập phiếu, và mọi Admin cấp cao.
export async function getDiscrepancyRecipients(receipt: { fromWarehouseId: string; fromRoomId: string | null; createdById: string }): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: "SUPER_ADMIN" },
        { role: receipt.fromRoomId ? "QUAN_LY_KHO_THANH_PHAM" : "KHO_MO", workplaceWarehouseId: receipt.fromWarehouseId },
      ],
    },
    select: { id: true },
  });
  return [...new Set([...users.map((u) => u.id), receipt.createdById])];
}
