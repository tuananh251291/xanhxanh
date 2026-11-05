import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isGardenAdmin } from "@/types";
import { canManageGarden } from "@/lib/garden-staff";
import { generateGardenCareLotCode } from "@/lib/codes";
import { addToLine, logMovement, InventoryError } from "@/lib/garden-inventory";

type Viewer = { id: string; role: UserRole | null | undefined };

// "Chăm sóc cây mô" (Nghiệp vụ 4) — xem model GardenCareLot (schema.prisma).

// Tự tạo lô chăm sóc cho mọi dòng của 1 phiếu bàn giao khi QLV xác nhận phiếu cây hỏng NV3 — số cây = thực nhận
// − tổng hỏng đã duyệt ở NV3 (gọi SAU khi đã cập nhật confirmedQuantity trong cùng transaction). Dòng đã có lô
// thì bỏ qua (mỗi dòng phiếu bàn giao chỉ 1 lô). Dòng không còn cây nào thì không tạo lô.
// Số cây của lô CHUYỂN từ GardenStock (tồn theo kho, chưa có lô) sang 1 dòng tồn GardenStockLine của lô (chưa xếp
// vị trí) — từ đây mọi thao tác NV4/NV5 chỉ làm trên dòng tồn, không đếm 2 lần.
export async function createCareLotsForReceipt(tx: Prisma.TransactionClient, receiptId: string, byId: string): Promise<number> {
  const receipt = await tx.gardenReceipt.findUniqueOrThrow({
    where: { id: receiptId },
    select: {
      gardenId: true, orderType: true,
      items: {
        select: {
          id: true, plantTypeId: true, stageCode: true, receivedQuantity: true, careLot: { select: { id: true } },
          damageItems: { where: { report: { status: "CONFIRMED" } }, select: { confirmedQuantity: true } },
        },
      },
    },
  });
  let created = 0;
  for (const it of receipt.items) {
    if (it.careLot) continue;
    const remaining = (it.receivedQuantity ?? 0) - it.damageItems.reduce((s, d) => s + (d.confirmedQuantity ?? 0), 0);
    if (remaining <= 0) continue;
    const lot = await tx.gardenCareLot.create({
      data: {
        code: await generateGardenCareLotCode(tx),
        gardenId: receipt.gardenId, pool: receipt.orderType, receiptItemId: it.id,
        plantTypeId: it.plantTypeId, stageCode: it.stageCode, initialQuantity: remaining, quantity: remaining,
      },
      select: { id: true, code: true },
    });
    const dec = await tx.gardenStock.updateMany({
      where: { gardenId: receipt.gardenId, pool: receipt.orderType, plantTypeId: it.plantTypeId, stageCode: it.stageCode, quantity: { gte: remaining } },
      data: { quantity: { decrement: remaining } },
    });
    if (dec.count !== 1) throw new InventoryError("Tồn kho vườn không đủ để chuyển sang lô chăm sóc — kiểm tra lại số liệu");
    await addToLine(tx, { gardenId: receipt.gardenId, pool: receipt.orderType, lotId: lot.id, plantTypeId: it.plantTypeId, stageCode: it.stageCode, rowId: null, staffId: null }, remaining);
    await logMovement(tx, {
      gardenId: receipt.gardenId, type: "RECEIVE", lotCode: lot.code, plantTypeId: it.plantTypeId, quantity: remaining,
      toPool: receipt.orderType, toStage: it.stageCode, note: "Chuyển sang chăm sóc cây mô sau phân loại (NV3)", byId,
    });
    created++;
  }
  return created;
}

// Hồ sơ Nhân sự vườn (NV chăm sóc cây mô) của 1 tài khoản.
export async function getCareStaffProfile(userId: string) {
  return prisma.gardenStaff.findFirst({
    where: { userId, isActive: true, types: { has: "CHAM_SOC_CAY_MO" }, garden: { isActive: true } },
    select: { id: true, gardenId: true, name: true },
  });
}

// Lô NV được giao: NV phụ trách cả lô (phiếu sắp xếp, GardenCareLot.staffId) HOẶC phụ trách ít nhất 1 dòng tồn
// đang chăm sóc (QLV phân ở Tồn kho & điều phối chỉ đổi GardenStockLine.staffId, 1 lô có thể chia nhiều NV).
function assignedCareLotWhere(staffId: string): Prisma.GardenCareLotWhereInput {
  return { OR: [{ staffId }, { stockLines: { some: { staffId, pool: { in: [...CARE_POOLS] }, quantity: { gt: 0 } } } }] };
}

export async function isAssignedToCareLot(staffId: string, lotId: string): Promise<boolean> {
  return (await prisma.gardenCareLot.count({ where: { id: lotId, ...assignedCareLotWhere(staffId) } })) > 0;
}

// Đồng bộ NV phụ trách của lô sau khi QLV đổi NV trên dòng tồn: giữ nguyên nếu NV hiện tại còn phụ trách dòng nào,
// không thì chuyển sang NV giữ nhiều cây nhất (hết NV thì bỏ trống). Lô không còn cây đang chăm sóc thì không đổi.
export async function syncCareLotStaff(tx: Prisma.TransactionClient, lotId: string) {
  const lot = await tx.gardenCareLot.findUnique({ where: { id: lotId }, select: { staffId: true } });
  const lines = await tx.gardenStockLine.findMany({ where: { lotId, pool: { in: [...CARE_POOLS] }, quantity: { gt: 0 } }, select: { staffId: true, quantity: true } });
  if (!lot || lines.length === 0) return;
  const qtyByStaff = new Map<string, number>();
  for (const l of lines) if (l.staffId) qtyByStaff.set(l.staffId, (qtyByStaff.get(l.staffId) ?? 0) + l.quantity);
  if (lot.staffId && qtyByStaff.has(lot.staffId)) return;
  const next = [...qtyByStaff.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (next !== lot.staffId) await tx.gardenCareLot.update({ where: { id: lotId }, data: { staffId: next } });
}

// Phạm vi lô xem được: NV chăm sóc cây mô = lô mình phụ trách; QLV = lô các vườn mình quản lý; Admin = tất cả.
export async function careLotScope(user: Viewer): Promise<Prisma.GardenCareLotWhereInput | null> {
  if (isGardenAdmin(user.role)) return {};
  if (user.role === "NHAN_VIEN_QUAN_LY_VUON") return { garden: { managerId: user.id } };
  if (user.role === "NV_CHAM_SOC_CAY_MO") {
    const profile = await getCareStaffProfile(user.id);
    return profile ? assignedCareLotWhere(profile.id) : { id: "__none__" };
  }
  return null;
}

// Người được lập phiếu cây hỏng / đạt size S cho 1 lô: NV phụ trách lô, hoặc QLV/Admin quản lý vườn.
export async function canReportOnLot(user: Viewer, lot: { id: string; gardenId: string }): Promise<boolean> {
  if (user.role === "NV_CHAM_SOC_CAY_MO") {
    const profile = await getCareStaffProfile(user.id);
    return !!profile && (await isAssignedToCareLot(profile.id, lot.id));
  }
  return canManageGarden(user, lot.gardenId);
}

// 2 kho đang chăm sóc cây mô (Nghiệp vụ 4) — cây đạt size S chuyển sang Kho thành phẩm (FINISHED).
export const CARE_POOLS = ["CONTAMINATED", "PLANNED"] as const;

// Mã vị trí dãy, VD "1A1".
export const rowLabel = (row: { number: number; rack: { letter: string; house: { number: number } } }) =>
  `${row.rack.house.number}${row.rack.letter}${row.number}`;
