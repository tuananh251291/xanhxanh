import { prisma } from "@/lib/prisma";
import { parse, isValid, startOfDay, addDays } from "date-fns";
import { SURPLUS_TRANSFER_TAG } from "@/types";

// "Lịch sử phiếu bàn giao" — xem lại MỌI phiếu bàn giao Phòng tối (NV cấy mô → Kho mô, gồm cả luồng
// Xanh/Vàng/Đỏ VÀ phiếu MM dư khi chỉ định kết thúc) đã tạo trong 1 khoảng ngày, không chỉ phiếu đang chờ
// xử lý như trang "Nhận bàn giao từ kho tối" (ReceivePhongToiBoard chỉ hiện PENDING) — dùng để tra cứu/đối
// chiếu về sau. Admin cấp cao xem được mọi cơ sở, Kho mô chỉ xem đúng cơ sở mình đang làm việc.
export type HandoverHistoryItemRow = {
  lotCode: string;
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  quantity: number;
  unqualifiedQuantity: number;
};

export type HandoverHistoryRow = {
  id: string;
  code: string;
  createdAt: Date;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  isSurplus: boolean;
  staffId: string;
  staffCode: string;
  staffName: string;
  warehouseName: string | null;
  toUserName: string | null;
  confirmedAt: Date | null;
  hasInspection: boolean;
  totalQuantity: number;
  totalUnqualifiedQuantity: number;
  totalContaminatedQuantity: number;
  items: HandoverHistoryItemRow[];
};

export async function computeHandoverHistory(params: {
  dateFrom?: string | null; // yyyy-MM-dd
  dateTo?: string | null; // yyyy-MM-dd, bao gồm hết ngày này
  staffId?: string;
  warehouseId?: string;
}): Promise<HandoverHistoryRow[]> {
  const { dateFrom, dateTo, staffId, warehouseId } = params;

  let dateRange: { gte?: Date; lt?: Date } | undefined;
  const parsedFrom = dateFrom ? parse(dateFrom, "yyyy-MM-dd", new Date()) : null;
  const parsedTo = dateTo ? parse(dateTo, "yyyy-MM-dd", new Date()) : null;
  if ((parsedFrom && isValid(parsedFrom)) || (parsedTo && isValid(parsedTo))) {
    dateRange = {};
    if (parsedFrom && isValid(parsedFrom)) dateRange.gte = startOfDay(parsedFrom);
    if (parsedTo && isValid(parsedTo)) dateRange.lt = addDays(startOfDay(parsedTo), 1);
  }

  const transfers = await prisma.transfer.findMany({
    where: {
      fromRoom: { type: "PHONG_TOI" },
      fromUser: { role: "CAY_MO", ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}) },
      ...(staffId ? { fromUserId: staffId } : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
    },
    select: {
      id: true,
      code: true,
      createdAt: true,
      status: true,
      notes: true,
      confirmedAt: true,
      fromUser: { select: { id: true, code: true, name: true, workplaceWarehouse: { select: { name: true } } } },
      toUser: { select: { name: true } },
      items: {
        select: {
          quantity: true,
          unqualifiedQuantity: true,
          lot: { select: { code: true, stageCode: true, plantType: { select: { code: true, name: true } } } },
        },
      },
      inspection: {
        select: {
          items: { select: { contaminatedQuantity: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return transfers.map((t) => {
    const totalQuantity = t.items.reduce((s, i) => s + i.quantity, 0);
    const totalUnqualifiedQuantity = t.items.reduce((s, i) => s + i.unqualifiedQuantity, 0);
    const totalContaminatedQuantity = t.inspection ? t.inspection.items.reduce((s, i) => s + i.contaminatedQuantity, 0) : 0;

    return {
      id: t.id,
      code: t.code,
      createdAt: t.createdAt,
      status: t.status,
      isSurplus: (t.notes ?? "").startsWith(SURPLUS_TRANSFER_TAG),
      staffId: t.fromUser.id,
      staffCode: t.fromUser.code,
      staffName: t.fromUser.name,
      warehouseName: t.fromUser.workplaceWarehouse?.name ?? null,
      toUserName: t.toUser?.name ?? null,
      confirmedAt: t.confirmedAt,
      hasInspection: !!t.inspection,
      totalQuantity,
      totalUnqualifiedQuantity,
      totalContaminatedQuantity,
      items: t.items.map((i) => ({
        lotCode: i.lot.code,
        plantTypeCode: i.lot.plantType.code,
        plantTypeName: i.lot.plantType.name,
        stageCode: i.lot.stageCode,
        quantity: i.quantity,
        unqualifiedQuantity: i.unqualifiedQuantity,
      })),
    };
  });
}
