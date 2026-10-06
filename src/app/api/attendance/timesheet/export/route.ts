import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { ROLE_LABELS } from "@/types";
import { ATTENDANCE_REQUEST_TYPE_LABELS, type AttendanceDayCell } from "@/lib/attendance";
import { MONTH_REGEX, buildMonthlyTimesheet, isAttendanceHr } from "@/lib/attendance-server";

// Ký hiệu 1 ô ngày trong file Excel (giống bảng công giấy): X = đủ công, X/2 = nửa công, P = phép năm,
// Ô = ốm, KL = không lương, T = thiếu chấm, V = vắng, CN = Chủ nhật, L = lễ.
function cellCode(d: AttendanceDayCell): string {
  const leaveCode = d.leaveType === "ANNUAL_LEAVE" ? "P" : d.leaveType === "SICK_LEAVE" ? "Ô" : d.leaveType === "UNPAID_LEAVE" ? "KL" : "";
  switch (d.status) {
    case "OFF": return "CN";
    case "HOLIDAY": return "L";
    case "LEAVE": return leaveCode;
    case "WORK": return d.workUnits === 0.5 ? `X/2${leaveCode ? `+${leaveCode}/2` : ""}` : d.workUnits === 1 ? "X" : "";
    case "MISSING_IN":
    case "MISSING_OUT": return "T";
    case "ABSENT": return "V";
    default: return "";
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAttendanceHr(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") ?? "";
  if (!MONTH_REGEX.test(month)) return NextResponse.json({ message: "Tháng không hợp lệ" }, { status: 400 });
  const { dateKeys, rows } = await buildMonthlyTimesheet({ month, warehouseId: sp.get("warehouseId") || null });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Bang cong ${month}`);
  const header = [
    "Mã NV", "Họ tên", "Vai trò", "Khu",
    ...dateKeys.map((k) => k.slice(8)),
    "Công thực tế", "Phép năm", "Nghỉ ốm", "Không lương", "Số lần muộn", "Phút muộn", "Số lần về sớm", "Phút về sớm", "Thiếu chấm", "Vắng",
  ];
  sheet.addRow([`BẢNG CHẤM CÔNG THÁNG ${month.slice(5)}/${month.slice(0, 4)}`]);
  sheet.addRow(["Ký hiệu: X đủ công · X/2 nửa công · P phép năm · Ô nghỉ ốm · KL không lương · T thiếu chấm · V vắng · CN Chủ nhật · L lễ"]);
  sheet.addRow([]);
  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };
  for (const r of rows) {
    const s = r.summary;
    sheet.addRow([
      r.code, r.name, r.role ? ROLE_LABELS[r.role] : "", r.warehouseName ?? "",
      ...r.days.map(cellCode),
      s.workUnits, s.paidLeaveUnits, s.sickLeaveUnits, s.unpaidLeaveUnits, s.lateCount, s.lateMinutes, s.earlyCount, s.earlyMinutes, s.missingCount, s.absentCount,
    ]);
  }
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.columns.forEach((col, i) => { col.width = i < 4 ? [10, 24, 18, 22][i] : i < 4 + dateKeys.length ? 5 : 12; });

  // Sheet 2: chi tiết giờ vào/ra từng ngày.
  const detail = workbook.addWorksheet("Chi tiet gio");
  const detailHeader = detail.addRow(["Mã NV", "Họ tên", "Ngày", "Giờ vào", "Giờ ra", "Muộn (phút)", "Về sớm (phút)", "Nghỉ", "Ghi chú"]);
  detailHeader.font = { bold: true };
  for (const r of rows) {
    for (const d of r.days) {
      if (!d.checkIn && !d.checkOut && !d.leaveType) continue;
      detail.addRow([
        r.code, r.name, `${d.date.slice(8)}/${d.date.slice(5, 7)}/${d.date.slice(0, 4)}`, d.checkIn ?? "", d.checkOut ?? "",
        d.lateMinutes || "", d.earlyMinutes || "",
        d.leaveType ? `${ATTENDANCE_REQUEST_TYPE_LABELS[d.leaveType]}${d.leaveUnits === 0.5 ? " (nửa ngày)" : ""}` : "",
        d.fixedByRequest ? "Bổ sung từ đơn quên chấm công" : "",
      ]);
    }
  }
  detail.columns.forEach((col, i) => { col.width = [10, 24, 12, 9, 9, 12, 13, 22, 32][i]; });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bang-cham-cong-${month}.xlsx"`,
    },
  });
}
