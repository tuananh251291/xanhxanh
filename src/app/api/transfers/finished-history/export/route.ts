import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import {
  FINISHED_HANDOVER_STATUS_LABEL, canViewFinishedHandoverHistory, computeFinishedHandoverHistory, resolveFinishedHistoryScope,
} from "@/lib/finished-handover-history";
import { QUALITY_DEFECT_LABELS } from "@/lib/quality-defects";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
// Giờ VN dạng "dd/MM/yyyy HH:mm" — tiến trình Node trên VPS không chạy giờ VN nên tự cộng lệch.
function fmtVn(d: Date | null): string {
  if (!d) return "";
  const v = new Date(d.getTime() + VN_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(v.getUTCDate())}/${p(v.getUTCMonth() + 1)}/${v.getUTCFullYear()} ${p(v.getUTCHours())}:${p(v.getUTCMinutes())}`;
}
const fmtDay = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : "");

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canViewFinishedHandoverHistory(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const scope = resolveFinishedHistoryScope(role, session?.user?.workplaceWarehouseId, sp.get("toWarehouseId"));
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const rows = scope
    ? await computeFinishedHandoverHistory({ dateFrom, dateTo, sourceWarehouseId: sp.get("sourceWarehouseId"), status: sp.get("status"), ...scope })
    : [];

  const workbook = new ExcelJS.Workbook();
  const title = `PHIẾU BÀN GIAO THÀNH PHẨM TỪ KHU SẢN XUẤT${dateFrom || dateTo ? ` (${fmtDay(dateFrom) || "…"} – ${fmtDay(dateTo) || "…"})` : ""}`;
  const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F4E6" } };

  // Sheet 1: mỗi phiếu 1 dòng.
  const summary = workbook.addWorksheet("Danh sach phieu");
  summary.addRow([title]).font = { bold: true, size: 14 };
  summary.addRow([]);
  const sHeader = summary.addRow([
    "Mã phiếu", "Thời gian bàn giao", "Khu sản xuất", "Phòng nguồn", "Kho thành phẩm", "NV bàn giao (mã)", "NV bàn giao",
    "Trạng thái", "Người nhận", "Thời gian nhận", "NV được phân công", "Tổng SL bàn giao", "Tổng SL lỗi", "Tổng SL đạt", "Ghi chú", "Góp ý Kho TP",
  ]);
  sHeader.font = { bold: true };
  sHeader.eachCell((c) => { c.fill = headerFill; });
  for (const r of rows) {
    summary.addRow([
      r.code, fmtVn(r.transferredAt), r.sourceWarehouseName ?? "", r.sourceRoomName ?? "", r.toWarehouseName, r.fromUserCode, r.fromUserName,
      FINISHED_HANDOVER_STATUS_LABEL[r.status], r.receivedByName ?? "", fmtVn(r.confirmedAt), r.assignedToName ?? "",
      r.totalQuantity, r.totalDefect ?? "", r.totalPassed ?? "", r.notes ?? "", r.receiveFeedback ?? "",
    ]);
  }
  const sTotal = summary.addRow([
    "TỔNG", "", "", "", "", "", "", "", "", "", "",
    rows.reduce((s, r) => s + r.totalQuantity, 0),
    rows.reduce((s, r) => s + (r.totalDefect ?? 0), 0),
    rows.reduce((s, r) => s + (r.totalPassed ?? 0), 0),
  ]);
  sTotal.font = { bold: true };
  [16, 18, 22, 18, 22, 14, 22, 12, 20, 18, 20, 14, 12, 12, 30, 30].forEach((w, i) => { summary.getColumn(i + 1).width = w; });
  [12, 13, 14].forEach((i) => { summary.getColumn(i).numFmt = "#,##0"; });

  // Sheet 2: chi tiết theo mã cây + quy cách của từng phiếu, kèm số lượng từng loại lỗi lúc nhận.
  const detail = workbook.addWorksheet("Chi tiet");
  detail.addRow([title]).font = { bold: true, size: 14 };
  detail.addRow([]);
  const dHeader = detail.addRow([
    "Mã phiếu", "Thời gian bàn giao", "Khu sản xuất", "Kho thành phẩm", "Trạng thái", "Mã cây", "Tên cây", "Quy cách",
    "SL bàn giao", ...QUALITY_DEFECT_LABELS, "Tổng lỗi", "SL đạt",
  ]);
  dHeader.font = { bold: true };
  dHeader.eachCell((c) => { c.fill = headerFill; });
  for (const r of rows) {
    for (const it of r.items) {
      detail.addRow([
        r.code, fmtVn(r.transferredAt), r.sourceWarehouseName ?? "", r.toWarehouseName, FINISHED_HANDOVER_STATUS_LABEL[r.status],
        it.plantTypeCode, it.plantTypeName, it.stageCode, it.quantity,
        ...(it.defectQuantities ?? QUALITY_DEFECT_LABELS.map(() => "")),
        it.defectTotal ?? "", it.passedQuantity ?? "",
      ]);
    }
  }
  const n = QUALITY_DEFECT_LABELS.length;
  [16, 18, 22, 22, 12, 12, 26, 10, 12, ...Array(n).fill(14), 10, 12].forEach((w, i) => { detail.getColumn(i + 1).width = w; });
  for (let i = 9; i <= 11 + n; i++) detail.getColumn(i).numFmt = "#,##0";
  dHeader.alignment = { wrapText: true, vertical: "middle" };

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `ban-giao-thanh-pham_${dateFrom ?? ""}_${dateTo ?? ""}.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
