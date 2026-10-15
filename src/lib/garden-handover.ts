import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateGardenHandoverCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";

// Đề xuất Trồng/Hủy của Quản lý kho thành phẩm lấy từ Phòng chờ xử lý (nhiệm vụ tuần QLK_DE_XUAT_TUAN) —
// CHỈ Admin cấp cao (SUPER_ADMIN) được duyệt/từ chối, khác các đề xuất khác (Admin thường vẫn duyệt được).
export function requiresSuperAdminApproval(room: { type: string } | null | undefined): boolean {
  return room?.type === "PHONG_CHO_XU_LY";
}

// Gộp các đề xuất Trồng (Kho thành phẩm, đã APPROVED, có Vườn) vừa duyệt vào phiếu "Bàn giao về Vườn sản
// xuất" — cùng batchCode + cùng vườn dùng chung 1 phiếu PENDING (duyệt từng dòng hay duyệt cả lô đều ra
// cùng 1 phiếu). Trả về id các phiếu MỚI tạo để báo Quản lý vườn sau khi transaction xong.
export async function attachApprovedToGardenHandover(tx: Prisma.TransactionClient, proposalIds: string[]): Promise<string[]> {
  const proposals = await tx.contaminationProposal.findMany({
    where: {
      id: { in: proposalIds }, type: "TRONG", status: "APPROVED", gardenHandoverId: null,
      productionGardenId: { not: null }, room: { type: "PHONG_CHO_XU_LY" },
    },
    select: { id: true, code: true, batchCode: true, warehouseId: true, productionGardenId: true },
  });
  const createdIds: string[] = [];
  for (const p of proposals) {
    const batchCode = p.batchCode ?? p.code;
    let handover = await tx.gardenHandover.findFirst({
      where: { batchCode, productionGardenId: p.productionGardenId!, warehouseId: p.warehouseId, status: "PENDING" },
      select: { id: true },
    });
    if (!handover) {
      handover = await tx.gardenHandover.create({
        data: { code: await generateGardenHandoverCode(tx), batchCode, warehouseId: p.warehouseId, productionGardenId: p.productionGardenId! },
        select: { id: true },
      });
      createdIds.push(handover.id);
    }
    await tx.contaminationProposal.update({ where: { id: p.id }, data: { gardenHandoverId: handover.id } });
  }
  return createdIds;
}

// Báo Quản lý vườn (hoặc Admin cấp cao nếu vườn chưa có quản lý) có phiếu bàn giao mới cần xác nhận nhận cây.
export async function notifyGardenHandoversCreated(handoverIds: string[]): Promise<void> {
  if (handoverIds.length === 0) return;
  const handovers = await prisma.gardenHandover.findMany({
    where: { id: { in: handoverIds } },
    select: { id: true, code: true, productionGarden: { select: { name: true, managerId: true } }, proposals: { select: { quantity: true } } },
  });
  for (const h of handovers) {
    const total = h.proposals.reduce((s, p) => s + p.quantity, 0);
    await createAlert({
      type: "GARDEN_HANDOVER_CREATED",
      title: "Có phiếu bàn giao cây về Vườn sản xuất",
      message: `Phiếu ${h.code}: ${total.toLocaleString("vi-VN")} cây từ Kho thành phẩm về ${h.productionGarden.name} — vào Bàn giao về Vườn để xác nhận đã nhận.`,
      ...(h.productionGarden.managerId ? { userId: h.productionGarden.managerId } : { targetRole: "SUPER_ADMIN" as const }),
      relatedId: h.id,
      relatedType: "GardenHandover",
    });
  }
}
