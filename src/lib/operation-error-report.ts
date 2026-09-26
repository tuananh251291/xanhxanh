import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays, parse, isValid } from "date-fns";

export type OperationErrorTicketRow = {
  id: string;
  code: string;
  occurredAt: Date;
  description: string;
  costAmount: number;
  xanhxanhCost: number;
  partnerCost: number;
  warehouseName: string;
  createdByName: string;
};

export type OperationErrorReportResult = {
  rangeStart: Date;
  rangeEnd: Date; // exclusive, hết tháng
  totalCount: number;
  totalCost: number;
  totalXanhxanhCost: number;
  totalPartnerCost: number;
  tickets: OperationErrorTicketRow[];
};

// Báo cáo "Đơn vận hành lỗi" — liệt kê OperationErrorTicket theo tháng XẢY RA lỗi (occurredAt, không
// phải ngày tạo bản ghi, cho phép NV bán hàng nhập bổ sung lỗi phát hiện muộn mà vẫn tính đúng tháng) +
// tổng nhanh chi phí mỗi bên chịu, dùng cho cả 2 phía xem (Đối tác vận hành CHỈ XEM) và bên tạo (NV bán
// hàng quản lý bán lẻ/Admin).
export async function computeOperationErrorReport(
  monthParam?: string | null,
  warehouseIds?: string[] | null
): Promise<OperationErrorReportResult> {
  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const anchor = isValid(parsedMonth) ? parsedMonth : new Date();
  const rangeStart = startOfMonth(anchor);
  const rangeEnd = addDays(endOfMonth(anchor), 1);

  const tickets = await prisma.operationErrorTicket.findMany({
    where: {
      occurredAt: { gte: rangeStart, lt: rangeEnd },
      ...(warehouseIds && warehouseIds.length > 0 ? { warehouseId: { in: warehouseIds } } : {}),
    },
    select: {
      id: true,
      code: true,
      occurredAt: true,
      description: true,
      costAmount: true,
      xanhxanhCost: true,
      partnerCost: true,
      warehouse: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { occurredAt: "desc" },
  });

  let totalCost = 0;
  let totalXanhxanhCost = 0;
  let totalPartnerCost = 0;
  const rows: OperationErrorTicketRow[] = tickets.map((t) => {
    totalCost += t.costAmount;
    totalXanhxanhCost += t.xanhxanhCost;
    totalPartnerCost += t.partnerCost;
    return {
      id: t.id,
      code: t.code,
      occurredAt: t.occurredAt,
      description: t.description,
      costAmount: t.costAmount,
      xanhxanhCost: t.xanhxanhCost,
      partnerCost: t.partnerCost,
      warehouseName: t.warehouse.name,
      createdByName: t.createdBy.name,
    };
  });

  return { rangeStart, rangeEnd, totalCount: rows.length, totalCost, totalXanhxanhCost, totalPartnerCost, tickets: rows };
}
