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
  // null = chưa xác định được (phiếu còn PENDING/REJECTED, chưa qua kiểm tra lẫn chưa tự ghi nhận) —
  // KHÁC 0 (đã xác định, không nhiễm/không ghi nhận). contaminatedQuantity/contaminationRatePct chỉ có
  // giá trị khi phiếu ĐÃ qua kiểm tra Kho mô (luồng Đỏ/Vàng) — luồng Xanh/MM dư không qua bước này nên
  // luôn null (không phải 0, vì không có nghĩa "0% nhiễm", mà là "không kiểm tra nhiễm ở đây").
  contaminatedQuantity: number | null;
  contaminationRatePct: number | null;
  recordedQuantity: number | null;
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
          lot: { select: { code: true, stageCode: true, plantTypeId: true, plantType: { select: { code: true, name: true } } } },
        },
      },
      inspection: {
        select: {
          items: { select: { plantTypeId: true, stageCode: true, handedOverQuantity: true, contaminatedQuantity: true, creditedQuantity: true } },
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

    // Kết quả kiểm tra chỉ lưu GỘP theo (mã cây, quy cách) — xem TransferInspectionItem — nên khớp lại
    // cho từng lô qua key này (giống hệt cách hiển thị ở inspect-form.tsx lúc Kho mô nhập, nếu 1 phiếu chỉ
    // có 1 lô/mã cây+quy cách thì đây chính là đúng số của lô đó).
    const inspectionByKey = new Map(
      (t.inspection?.items ?? []).map((i) => [`${i.plantTypeId}|${i.stageCode}`, i])
    );

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
      items: t.items.map((i) => {
        const group = inspectionByKey.get(`${i.lot.plantTypeId}|${i.lot.stageCode}`);
        // Đã kiểm tra (luồng Đỏ/Vàng) => lấy đúng số Kho mô đã ghi nhận. Chưa kiểm tra nhưng phiếu đã
        // CONFIRMED (xếp kệ xong) => tại thời điểm đó đi theo đường Xanh/MM dư, tự ghi nhận theo NV tự
        // khai (không qua kiểm tra nhiễm nên contaminatedQuantity/contaminationRatePct để null). Còn lại
        // (PENDING/REJECTED, chưa qua đường nào) => chưa xác định, để null.
        const recordedQuantity = group
          ? group.creditedQuantity
          : t.status === "CONFIRMED"
          ? Math.max(0, i.quantity - i.unqualifiedQuantity)
          : null;
        return {
          lotCode: i.lot.code,
          plantTypeCode: i.lot.plantType.code,
          plantTypeName: i.lot.plantType.name,
          stageCode: i.lot.stageCode,
          quantity: i.quantity,
          unqualifiedQuantity: i.unqualifiedQuantity,
          contaminatedQuantity: group ? group.contaminatedQuantity : null,
          contaminationRatePct: group
            ? group.handedOverQuantity > 0
              ? Math.round((group.contaminatedQuantity / group.handedOverQuantity) * 1000) / 10
              : 0
            : null,
          recordedQuantity,
        };
      }),
    };
  });
}
