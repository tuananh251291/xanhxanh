import { addDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { resolvePayrollPeriod } from "@/lib/payroll-period";
import { computeProductionRecordForPeriod } from "@/lib/production-record-report";

// Báo cáo "Sản lượng ghi nhận" cho HCNS — 1 dòng = 1 NV cấy mô × 1 mã cây × 1 quy cách trong 1 kỳ lương.
// Số lượng lấy từ computeProductionRecordForPeriod (cùng công thức "ghi nhận" với Bảng lương, theo NGÀY CẤY
// của lô); Thành tiền = SL ghi nhận × đơn giá "Quy đổi sản lượng – KPI" (PlantTypeKpiRate theo mã cây +
// quy cách) — tổng thành tiền 1 NV = "Sản lượng đủ điều kiện" trên Bảng lương.
export type ProductionOutputRow = {
  staffId: string;
  staffCode: string;
  staffName: string;
  warehouseName: string | null;
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  handedOverQuantity: number;
  recordedQuantity: number;
  contaminatedQuantity: number;
  // Nhiễm / (bàn giao + nhiễm) — mẫu số là số GỐC trước khi trừ nhiễm (SL bàn giao đã trừ phần nhiễm Kho mô phát hiện).
  contaminationRatePct: number;
  unitPrice: number | null; // null = chưa cài đơn giá cho mã cây + quy cách này
  amount: number;
};

export async function buildProductionOutputReport(params: { month?: string | null; warehouseId?: string; q?: string | null }) {
  const { periodMonth, rangeStart, rangeEnd } = resolvePayrollPeriod(params.month);
  const record = await computeProductionRecordForPeriod(format(rangeStart, "yyyy-MM-dd"), format(addDays(rangeEnd, -1), "yyyy-MM-dd"), params.warehouseId);
  const rates = await prisma.plantTypeKpiRate.findMany({ select: { plantTypeId: true, stageCode: true, vndPerUnit: true } });
  const rateMap = new Map(rates.map((r) => [`${r.plantTypeId}|${r.stageCode}`, r.vndPerUnit]));

  const q = params.q?.trim().toLowerCase() ?? "";
  const rows: ProductionOutputRow[] = record.rows
    .flatMap((r) =>
      r.byPlantStage.map((p) => {
        const unitPrice = rateMap.get(`${p.plantTypeId}|${p.stageCode}`) ?? null;
        const base = p.handedOverQuantity + p.contaminatedQuantity;
        return {
          staffId: r.staffId,
          staffCode: r.staffCode,
          staffName: r.staffName,
          warehouseName: r.warehouseName,
          plantTypeCode: p.plantTypeCode,
          plantTypeName: p.plantTypeName,
          stageCode: p.stageCode,
          handedOverQuantity: p.handedOverQuantity,
          recordedQuantity: p.quantity,
          contaminatedQuantity: p.contaminatedQuantity,
          contaminationRatePct: base > 0 ? Math.round((p.contaminatedQuantity / base) * 10000) / 100 : 0,
          unitPrice,
          amount: p.quantity * (unitPrice ?? 0),
        };
      })
    )
    // Bỏ dòng toàn 0 (VD phiếu có lô cấy ngoài kỳ đã bị lọc hết số).
    .filter((r) => r.handedOverQuantity || r.recordedQuantity || r.contaminatedQuantity)
    .filter((r) => !q || [r.staffCode, r.staffName, r.plantTypeCode, r.plantTypeName].some((x) => x.toLowerCase().includes(q)))
    .sort((a, b) =>
      (a.warehouseName ?? "").localeCompare(b.warehouseName ?? "") || a.staffCode.localeCompare(b.staffCode)
      || a.plantTypeCode.localeCompare(b.plantTypeCode) || a.stageCode.localeCompare(b.stageCode)
    );

  const totals = rows.reduce(
    (t, r) => ({
      handedOverQuantity: t.handedOverQuantity + r.handedOverQuantity,
      recordedQuantity: t.recordedQuantity + r.recordedQuantity,
      contaminatedQuantity: t.contaminatedQuantity + r.contaminatedQuantity,
      amount: t.amount + r.amount,
    }),
    { handedOverQuantity: 0, recordedQuantity: 0, contaminatedQuantity: 0, amount: 0 }
  );

  return { periodMonth, rangeStart, rangeEnd, rows, totals, missingPriceCount: rows.filter((r) => r.unitPrice == null && r.recordedQuantity > 0).length };
}
