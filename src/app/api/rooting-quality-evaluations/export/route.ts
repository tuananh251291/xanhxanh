import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { format, addDays, getISOWeek } from "date-fns";
import { auth } from "@/lib/auth";
import { listRootingEvaluationsForViewer } from "@/lib/rooting-quality-evaluation";

const pct = (passed: number, total: number) => (total > 0 ? Math.round((passed / total) * 1000) / 1000 : 0);

// Xuất file Excel "Báo cáo đánh giá chất lượng cây ra rễ" — đúng tập dữ liệu trang báo cáo đang xem
// (đánh giá đã HOÀN THÀNH, theo phạm vi xem của từng vai trò, xem listRootingEvaluationsForViewer).
// ?week=<weekStart ISO> = chỉ 1 "Tuần giao Kho TP", bỏ trống = tất cả. 2 sheet: Tổng hợp (1 dòng/đánh giá)
// và Chi tiết (1 dòng/loại cây + quy cách).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const week = new URL(req.url).searchParams.get("week");
  const weekStart = week ? new Date(week) : null;
  if (weekStart && Number.isNaN(weekStart.getTime())) {
    return NextResponse.json({ message: "Tuần không hợp lệ" }, { status: 400 });
  }

  const evaluations = await listRootingEvaluationsForViewer(
    { id: session.user.id, role: session.user.role, workplaceWarehouseId: session.user.workplaceWarehouseId },
    { status: "COMPLETED", weekStart }
  );
  if (!evaluations) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const weekLabel = (d: Date) => `Tuần ${getISOWeek(d)} (${format(d, "dd/MM")} – ${format(addDays(d, 6), "dd/MM/yyyy")})`;
  const groupLabel = (e: (typeof evaluations)[number]) => `${e.label}${e.shelfRange ? ` (${e.shelfRange})` : ""}`;

  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Tổng hợp");
  summary.columns = [
    { header: "Mã đánh giá", key: "code", width: 18 },
    { header: "Nhóm tuần", key: "group", width: 30 },
    { header: "Vào phòng ra rễ", key: "entryWeek", width: 18 },
    { header: "Phòng", key: "room", width: 20 },
    { header: "Cơ sở", key: "warehouse", width: 24 },
    { header: "Tuần giao Kho TP", key: "week", width: 30 },
    { header: "NV Kỹ thuật", key: "staff", width: 24 },
    { header: "Tổng", key: "total", width: 12 },
    { header: "Đạt", key: "passed", width: 12 },
    { header: "Không đạt", key: "failed", width: 12 },
    { header: "Tỉ lệ đạt", key: "pct", width: 12 },
    { header: "Lý do", key: "reason", width: 50 },
  ];
  const detail = workbook.addWorksheet("Chi tiết");
  detail.columns = [
    { header: "Mã đánh giá", key: "code", width: 18 },
    { header: "Nhóm tuần", key: "group", width: 30 },
    { header: "Cơ sở", key: "warehouse", width: 24 },
    { header: "Tuần giao Kho TP", key: "week", width: 30 },
    { header: "Mã cây", key: "plantCode", width: 12 },
    { header: "Tên cây", key: "plantName", width: 30 },
    { header: "Quy cách", key: "stage", width: 10 },
    { header: "Tổng", key: "total", width: 12 },
    { header: "Đạt", key: "passed", width: 12 },
    { header: "Không đạt", key: "failed", width: 12 },
    { header: "Tỉ lệ đạt", key: "pct", width: 12 },
  ];

  for (const e of evaluations) {
    const total = e.items.reduce((s, i) => s + i.totalQuantity, 0);
    const passed = e.items.reduce((s, i) => s + i.passedQuantity, 0);
    const ws = new Date(e.weekStart);
    summary.addRow({
      code: e.code, group: groupLabel(e), entryWeek: e.entryWeek ?? "", room: e.room.name, warehouse: e.warehouse.name,
      week: weekLabel(ws), staff: `${e.assignedTo.name} (${e.assignedTo.code})`,
      total, passed, failed: total - passed, pct: pct(passed, total), reason: e.reason ?? "",
    });
    // Giống màn hình: loại cây % đạt thấp nhất lên đầu.
    const items = [...e.items].sort(
      (a, b) => pct(a.passedQuantity, a.totalQuantity) - pct(b.passedQuantity, b.totalQuantity) || a.plantType.code.localeCompare(b.plantType.code)
    );
    for (const it of items) {
      detail.addRow({
        code: e.code, group: groupLabel(e), warehouse: e.warehouse.name, week: weekLabel(ws),
        plantCode: it.plantType.code, plantName: it.plantType.name, stage: it.stageCode,
        total: it.totalQuantity, passed: it.passedQuantity, failed: it.totalQuantity - it.passedQuantity,
        pct: pct(it.passedQuantity, it.totalQuantity),
      });
    }
  }

  for (const sheet of [summary, detail]) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getColumn("pct").numFmt = "0.0%";
    for (const key of ["total", "passed", "failed"]) sheet.getColumn(key).numFmt = "#,##0";
  }
  summary.getColumn("reason").alignment = { wrapText: true, vertical: "top" };

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = weekStart ? `danh-gia-ra-re-tuan-${getISOWeek(weekStart)}-${format(weekStart, "yyyy")}.xlsx` : "danh-gia-ra-re.xlsx";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
