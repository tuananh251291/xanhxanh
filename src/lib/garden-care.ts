import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import { canManageGarden } from "@/lib/garden-staff";
import { generateGardenCareLotCode } from "@/lib/codes";

type Viewer = { id: string; role: UserRole | null | undefined };

// "Chăm sóc cây mô" (Nghiệp vụ 4) — xem model GardenCareLot (schema.prisma).

// Tự tạo lô chăm sóc cho mọi dòng của 1 phiếu bàn giao khi QLV xác nhận phiếu cây hỏng NV3 — số cây = thực nhận
// − tổng hỏng đã duyệt ở NV3 (gọi SAU khi đã cập nhật confirmedQuantity trong cùng transaction). Dòng đã có lô
// thì bỏ qua (mỗi dòng phiếu bàn giao chỉ 1 lô). Dòng không còn cây nào thì không tạo lô.
export async function createCareLotsForReceipt(tx: Prisma.TransactionClient, receiptId: string): Promise<number> {
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
    await tx.gardenCareLot.create({
      data: {
        code: await generateGardenCareLotCode(tx),
        gardenId: receipt.gardenId, pool: receipt.orderType, receiptItemId: it.id,
        plantTypeId: it.plantTypeId, stageCode: it.stageCode, initialQuantity: remaining, quantity: remaining,
      },
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

// Phạm vi lô xem được: NV chăm sóc cây mô = lô mình phụ trách; QLV = lô các vườn mình quản lý; Admin = tất cả.
export async function careLotScope(user: Viewer): Promise<Prisma.GardenCareLotWhereInput | null> {
  if (isAdminRole(user.role)) return {};
  if (user.role === "NHAN_VIEN_QUAN_LY_VUON") return { garden: { managerId: user.id } };
  if (user.role === "NV_CHAM_SOC_CAY_MO") {
    const profile = await getCareStaffProfile(user.id);
    return profile ? { staffId: profile.id } : { id: "__none__" };
  }
  return null;
}

// Người được lập phiếu cây hỏng / đạt size S cho 1 lô: NV phụ trách lô, hoặc QLV/Admin quản lý vườn.
export async function canReportOnLot(user: Viewer, lot: { gardenId: string; staffId: string | null }): Promise<boolean> {
  if (user.role === "NV_CHAM_SOC_CAY_MO") {
    const profile = await getCareStaffProfile(user.id);
    return !!profile && profile.id === lot.staffId;
  }
  return canManageGarden(user, lot.gardenId);
}

// Số cây theo dãy của 1 lô + phần chưa xếp.
export function summarizePlacements(lot: { quantity: number; placements: { rowId: string; quantity: number }[] }) {
  const placed = lot.placements.reduce((s, p) => s + p.quantity, 0);
  return { placed, unplaced: lot.quantity - placed };
}

// Mã vị trí dãy, VD "1A1".
export const rowLabel = (row: { number: number; rack: { letter: string; house: { number: number } } }) =>
  `${row.rack.house.number}${row.rack.letter}${row.number}`;
