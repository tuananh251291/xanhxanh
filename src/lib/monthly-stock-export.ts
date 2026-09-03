import { startOfMonth, endOfMonth, addMonths, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { MOTHER_WAREHOUSE_TRANSFER_TAG } from "@/types";

// Tháng bắt đầu 2 báo cáo "Tải dữ liệu thống kê" (Admin) — Số tồn kho mẫu mẹ/thành phẩm cuối kỳ hàng
// tháng, phân loại theo cơ sở. Cố định 7/2026 theo đúng yêu cầu, không đọc từ cấu hình nào khác.
const REPORT_START_MONTH = new Date(2026, 6, 1);

export type MonthColumn = { label: string; asOf: Date; isCurrent: boolean };

// Danh sách các mốc "cuối kỳ" từ REPORT_START_MONTH đến tháng hiện tại — tháng đã qua dùng đúng 23:59:59
// ngày cuối tháng (endOfMonth), tháng đang chạy dở dùng NGAY LÚC xuất báo cáo (không phải cuối tháng,
// vì tháng chưa kết thúc) — nhãn cột ghi rõ "(đến hiện tại)" để khỏi hiểu nhầm là số đã chốt.
export function getReportMonthColumns(now: Date = new Date()): MonthColumn[] {
  const columns: MonthColumn[] = [];
  let cursor = startOfMonth(REPORT_START_MONTH);
  const currentMonthStart = startOfMonth(now);
  while (cursor.getTime() <= currentMonthStart.getTime()) {
    const isCurrent = cursor.getTime() === currentMonthStart.getTime();
    columns.push({
      label: isCurrent ? `${format(cursor, "MM/yyyy")} (đến hiện tại)` : format(cursor, "MM/yyyy"),
      asOf: isCurrent ? now : endOfMonth(cursor),
      isCurrent,
    });
    cursor = addMonths(cursor, 1);
  }
  return columns;
}

async function getActivePlantTypes() {
  return prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
}

async function getActiveWarehouses(type: "SAN_XUAT" | "THANH_PHAM") {
  return prisma.warehouse.findMany({ where: { type, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });
}

export type StockByFacilityRow = { warehouseCode: string; warehouseName: string; plantTypeCode: string; plantTypeName: string; byMonth: number[] };

// Dựng lại tồn MẪU MẸ (Phòng mẫu mẹ) tại từng mốc cuối kỳ — CÙNG công thức với
// computeRawBalanceForPlantType (src/lib/mother-stock-growth-report.ts), chỉ khác là fetch 1 LẦN cho cả
// warehouse+plantType rồi tính cho NHIỀU mốc asOf cùng lúc (thay vì query lại cho từng mốc) — đỡ tốn
// query khi phải dựng nhiều tháng liên tiếp cho báo cáo Excel.
export async function computeMotherStockByFacility(months: MonthColumn[]): Promise<StockByFacilityRow[]> {
  const [warehouses, plantTypes] = await Promise.all([getActiveWarehouses("SAN_XUAT"), getActivePlantTypes()]);
  const rows: StockByFacilityRow[] = [];

  for (const wh of warehouses) {
    for (const pt of plantTypes) {
      const [lots, futureSends] = await Promise.all([
        prisma.lot.findMany({
          where: { stage: "MAU_ME", plantTypeId: pt.id, shelf: { warehouseId: wh.id, room: { type: "PHONG_MAU_ME" } } },
          select: {
            quantity: true,
            status: true,
            enteredAt: true,
            instructionItems: { select: { instruction: { select: { handedOverAt: true } } }, take: 1 },
          },
        }),
        prisma.transferItem.findMany({
          where: {
            transfer: { fromWarehouseId: wh.id, notes: { startsWith: MOTHER_WAREHOUSE_TRANSFER_TAG } },
            lot: { stage: "MAU_ME", plantTypeId: pt.id },
          },
          select: { quantity: true, transfer: { select: { transferredAt: true } }, lot: { select: { enteredAt: true } } },
        }),
      ]);

      const byMonth = months.map(({ asOf }) => {
        let total = 0;
        for (const lot of lots) {
          if (lot.enteredAt.getTime() > asOf.getTime()) continue;
          const handedOverAt = lot.instructionItems[0]?.instruction.handedOverAt ?? null;
          const consumedByAsOf = lot.status === "PLANTED" && handedOverAt !== null && handedOverAt.getTime() <= asOf.getTime();
          if (!consumedByAsOf) total += lot.quantity;
        }
        for (const fs of futureSends) {
          if (fs.lot.enteredAt.getTime() <= asOf.getTime() && fs.transfer.transferredAt.getTime() > asOf.getTime()) total += fs.quantity;
        }
        return total;
      });

      if (byMonth.some((v) => v !== 0)) {
        rows.push({ warehouseCode: wh.code, warehouseName: wh.name, plantTypeCode: pt.code, plantTypeName: pt.name, byMonth });
      }
    }
  }

  return rows;
}

// Dựng lại tồn THÀNH PHẨM (Phòng ra rễ — nơi thành phẩm còn nằm TRONG kho sản xuất, trước khi bàn giao
// sang Kho thành phẩm) tại từng mốc cuối kỳ, phân theo cơ sở — CÙNG cách tiếp cận với mẫu mẹ (lô đang
// nằm trên kệ + cộng bù phần đã rời kệ SAU mốc asOf), khác 1 điểm: 1 khi lô rời Phòng ra rễ (bàn giao
// sang Kho thành phẩm), enteredAt của CHÍNH lô đó bị ghi đè lại thành lúc lên phòng đích (xem PATCH
// /api/transfers/[id], dòng data: { roomId, shelfId: null, enteredAt: new Date() }) — KHÁC mẫu mẹ (gửi
// liên kho chỉ trừ quantity của lô nguồn, enteredAt gốc không đổi, xem sendMotherStockToWarehouse) — nên
// không dùng lại được enteredAt của lô đã rời đi để biết nó "đã có mặt từ khi nào". Dùng Lot.createdAt
// (bất biến, luôn có, luôn SỚM HƠN hoặc bằng đúng lúc lên kệ Phòng ra rễ — lô tạo ở Phòng tối cá nhân rồi
// mới lên kệ) làm mốc thay thế — giới hạn chấp nhận được: có thể lệch vài ngày so với đúng ngày lên kệ
// thật (thời gian chờ Phòng tối), hiếm khi đủ để đổi tháng dựng báo cáo trừ phi lô vừa tạo, vừa lên kệ,
// vừa rời kệ chỉ trong vài ngày sát ranh giới cuối tháng.
export async function computeFinishedStockByFacility(months: MonthColumn[]): Promise<StockByFacilityRow[]> {
  const [warehouses, plantTypes] = await Promise.all([getActiveWarehouses("SAN_XUAT"), getActivePlantTypes()]);
  const rows: StockByFacilityRow[] = [];

  for (const wh of warehouses) {
    for (const pt of plantTypes) {
      const [lots, departed] = await Promise.all([
        prisma.lot.findMany({
          where: { stage: "THANH_PHAM", plantTypeId: pt.id, shelf: { warehouseId: wh.id, room: { type: "PHONG_RA_RE" } } },
          select: { quantity: true, enteredAt: true },
        }),
        prisma.transferItem.findMany({
          where: {
            transfer: { status: "CONFIRMED", fromRoom: { type: "PHONG_RA_RE", warehouseId: wh.id } },
            lot: { stage: "THANH_PHAM", plantTypeId: pt.id },
          },
          select: { quantity: true, transfer: { select: { confirmedAt: true } }, lot: { select: { createdAt: true } } },
        }),
      ]);

      const byMonth = months.map(({ asOf }) => {
        let total = 0;
        for (const lot of lots) {
          if (lot.enteredAt.getTime() <= asOf.getTime()) total += lot.quantity;
        }
        for (const d of departed) {
          if (!d.transfer.confirmedAt) continue;
          if (d.lot.createdAt.getTime() <= asOf.getTime() && d.transfer.confirmedAt.getTime() > asOf.getTime()) total += d.quantity;
        }
        return total;
      });

      if (byMonth.some((v) => v !== 0)) {
        rows.push({ warehouseCode: wh.code, warehouseName: wh.name, plantTypeCode: pt.code, plantTypeName: pt.name, byMonth });
      }
    }
  }

  return rows;
}
