import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays, parse, isValid } from "date-fns";

// Báo cáo "Phiếu kiểm tra hàng không đạt/nhiễm" — liệt kê từng dòng (mã cây) trong các phiếu kiểm tra
// (TransferInspection, luồng Vàng/Đỏ — luồng Xanh không qua kiểm tra) CÓ ghi nhận hàng không đạt yêu cầu
// (unqualifiedQuantity, NV tự khai hoặc Kho mô sửa lại) hoặc hàng nhiễm (contaminatedQuantity, phát hiện
// lúc kiểm tra mẫu) — theo từng NV cấy mô, trong tháng + khu sản xuất chọn. Dùng để đối chiếu vì sao 1 NV
// bị trừ sản lượng/lương (xem creditedQuantity ở computePayrollForPeriod).
export type InspectionDefectTicketRow = {
  inspectionId: string;
  transferCode: string;
  transferDate: Date;
  staffId: string;
  staffCode: string;
  staffName: string;
  inspectedByName: string;
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  handedOverQuantity: number;
  unqualifiedQuantity: number;
  contaminatedQuantity: number;
  passedQuantity: number;
  creditedQuantity: number;
};

export type InspectionDefectStaffSummary = {
  staffId: string;
  staffCode: string;
  staffName: string;
  ticketCount: number;
  totalUnqualifiedQuantity: number;
  totalContaminatedQuantity: number;
};

export type InspectionDefectReportResult = {
  rangeStart: Date;
  rangeEnd: Date; // bao gồm hết ngày cuối tháng
  staffSummary: InspectionDefectStaffSummary[];
  tickets: InspectionDefectTicketRow[];
};

export async function computeInspectionDefectReport(monthParam?: string | null, warehouseId?: string): Promise<InspectionDefectReportResult> {
  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const anchor = isValid(parsedMonth) ? parsedMonth : new Date();
  const rangeStart = startOfMonth(anchor);
  const rangeEndInclusive = endOfMonth(anchor);
  const rangeEndExclusive = addDays(rangeEndInclusive, 1);

  const inspections = await prisma.transferInspection.findMany({
    where: {
      transfer: {
        fromRoom: { type: "PHONG_TOI" },
        createdAt: { gte: rangeStart, lt: rangeEndExclusive },
        fromUser: { role: "CAY_MO", ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}) },
      },
    },
    select: {
      id: true,
      transfer: { select: { code: true, createdAt: true, fromUser: { select: { id: true, code: true, name: true } } } },
      inspectedBy: { select: { name: true } },
      items: {
        where: { OR: [{ unqualifiedQuantity: { gt: 0 } }, { contaminatedQuantity: { gt: 0 } }] },
        select: {
          plantType: { select: { code: true, name: true } },
          stageCode: true,
          handedOverQuantity: true,
          unqualifiedQuantity: true,
          contaminatedQuantity: true,
          passedQuantity: true,
          creditedQuantity: true,
        },
      },
    },
    orderBy: { transfer: { createdAt: "asc" } },
  });

  const tickets: InspectionDefectTicketRow[] = [];
  const summaryByStaff = new Map<string, InspectionDefectStaffSummary>();

  for (const insp of inspections) {
    if (insp.items.length === 0) continue; // phiếu này không có dòng nào bị trừ — bỏ qua
    const staff = insp.transfer.fromUser;
    const summary = summaryByStaff.get(staff.id) ?? {
      staffId: staff.id, staffCode: staff.code, staffName: staff.name,
      ticketCount: 0, totalUnqualifiedQuantity: 0, totalContaminatedQuantity: 0,
    };
    summary.ticketCount += 1;

    for (const item of insp.items) {
      summary.totalUnqualifiedQuantity += item.unqualifiedQuantity;
      summary.totalContaminatedQuantity += item.contaminatedQuantity;
      tickets.push({
        inspectionId: insp.id,
        transferCode: insp.transfer.code,
        transferDate: insp.transfer.createdAt,
        staffId: staff.id,
        staffCode: staff.code,
        staffName: staff.name,
        inspectedByName: insp.inspectedBy.name,
        plantTypeCode: item.plantType.code,
        plantTypeName: item.plantType.name,
        stageCode: item.stageCode,
        handedOverQuantity: item.handedOverQuantity,
        unqualifiedQuantity: item.unqualifiedQuantity,
        contaminatedQuantity: item.contaminatedQuantity,
        passedQuantity: item.passedQuantity,
        creditedQuantity: item.creditedQuantity,
      });
    }
    summaryByStaff.set(staff.id, summary);
  }

  const staffSummary = Array.from(summaryByStaff.values()).sort(
    (a, b) => (b.totalUnqualifiedQuantity + b.totalContaminatedQuantity) - (a.totalUnqualifiedQuantity + a.totalContaminatedQuantity) || a.staffName.localeCompare(b.staffName)
  );

  return { rangeStart, rangeEnd: rangeEndExclusive, staffSummary, tickets };
}
