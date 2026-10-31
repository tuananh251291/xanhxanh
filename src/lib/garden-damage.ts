import type { GardenOrderType, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isGardenAdmin } from "@/types";
import { canManageGarden } from "@/lib/garden-staff";

type Client = Prisma.TransactionClient | typeof prisma;
type Viewer = { id: string; role: UserRole | null | undefined };

// "Phân loại cây và ghi nhận cây hỏng" — xem model GardenDamageReport (schema.prisma).

// Vườn của 1 NV chăm sóc cây mô = hồ sơ Nhân sự vườn đang liên kết tài khoản này (còn vị trí Chăm sóc cây mô).
export async function getCareStaffGarden(userId: string): Promise<{ gardenId: string; gardenName: string } | null> {
  const staff = await prisma.gardenStaff.findFirst({
    where: { userId, isActive: true, types: { has: "CHAM_SOC_CAY_MO" }, garden: { isActive: true } },
    select: { gardenId: true, garden: { select: { name: true } } },
  });
  return staff ? { gardenId: staff.gardenId, gardenName: staff.garden.name } : null;
}

// Người được lập phiếu cho 1 vườn: NV chăm sóc cây mô của đúng vườn đó, hoặc QLV/Admin quản lý vườn.
export async function canCreateDamageReport(user: Viewer, gardenId: string): Promise<boolean> {
  if (user.role === "NV_CHAM_SOC_CAY_MO") return (await getCareStaffGarden(user.id))?.gardenId === gardenId;
  return canManageGarden(user, gardenId);
}

// Phạm vi xem danh sách phiếu: NV chăm sóc cây mô chỉ thấy phiếu mình tạo; QLV thấy phiếu các vườn mình quản lý;
// Admin thấy tất cả. null = không có quyền.
export async function damageReportScope(user: Viewer): Promise<Prisma.GardenDamageReportWhereInput | null> {
  if (isGardenAdmin(user.role)) return {};
  if (user.role === "NV_CHAM_SOC_CAY_MO") return { createdById: user.id };
  if (user.role === "NHAN_VIEN_QUAN_LY_VUON") return { garden: { managerId: user.id } };
  return null;
}

// Số còn ghi nhận hỏng được của từng dòng phiếu bàn giao = thực nhận − tổng số hỏng ĐÃ XÁC NHẬN ở các phiếu
// khác của cùng dòng (mỗi cây chỉ ghi hỏng 1 lần).
export async function getRemainingByReceiptItem(receiptItemIds: string[], excludeReportId: string | null, client: Client = prisma): Promise<Map<string, number>> {
  const [items, damaged] = await Promise.all([
    client.gardenReceiptItem.findMany({ where: { id: { in: receiptItemIds } }, select: { id: true, receivedQuantity: true } }),
    client.gardenDamageItem.groupBy({
      by: ["receiptItemId"],
      where: { receiptItemId: { in: receiptItemIds }, report: { status: "CONFIRMED", ...(excludeReportId ? { id: { not: excludeReportId } } : {}) } },
      _sum: { confirmedQuantity: true },
    }),
  ]);
  const damagedBy = new Map(damaged.map((d) => [d.receiptItemId, d._sum.confirmedQuantity ?? 0]));
  return new Map(items.map((i) => [i.id, Math.max(0, (i.receivedQuantity ?? 0) - (damagedBy.get(i.id) ?? 0))]));
}

// Tồn hiện tại của 1 kho trong vườn (Kho nhiễm/Kho cây trồng) theo mã cây + quy cách.
export async function getPoolStock(gardenId: string, pool: GardenOrderType, client: Client = prisma): Promise<Map<string, number>> {
  const rows = await client.gardenStock.findMany({ where: { gardenId, pool }, select: { plantTypeId: true, stageCode: true, quantity: true } });
  return new Map(rows.map((r) => [`${r.plantTypeId}:${r.stageCode}`, r.quantity]));
}
