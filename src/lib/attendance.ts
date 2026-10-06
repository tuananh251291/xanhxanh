import type { AttendanceDayPortion, AttendanceRequestType, AttendanceRequestStatus, UserRole } from "@prisma/client";

// Các vai trò được tự chấm công trên phần mềm — vai trò khác không thấy nút chấm công.
export const ATTENDANCE_ROLES: UserRole[] = ["KHO_MO", "CAY_MO", "KY_THUAT", "KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM"];

export function isAttendanceRole(role: UserRole | null | undefined): boolean {
  return !!role && ATTENDANCE_ROLES.includes(role);
}

// Quỹ phép năm mặc định — cùng giá trị ANNUAL_LEAVE_DAYS ở src/lib/kpi-daily-rate.ts (file đó import prisma
// nên không import thẳng được vào file dùng chung client/server này).
export const DEFAULT_ANNUAL_LEAVE_DAYS = 12;

// Selfie chỉ cần nhận diện mặt — nén nhỏ (~120KB) cho nhẹ Storage và mạng yếu ở hiện trường.
export const ATTENDANCE_SELFIE_COMPRESS_OPTIONS = {
  targetMaxBytes: 120 * 1024,
  hardLimitBytes: 300 * 1024,
  dimensionSteps: [720, 640, 480] as const,
  stampTimestamp: true,
};
export const ATTENDANCE_SELFIE_MAX_DATA_URL_LENGTH = 600_000;

export const ATTENDANCE_REQUEST_TYPE_LABELS: Record<AttendanceRequestType, string> = {
  ANNUAL_LEAVE: "Nghỉ phép năm",
  SICK_LEAVE: "Nghỉ ốm",
  UNPAID_LEAVE: "Nghỉ không lương",
  LATE_EARLY: "Đi muộn / về sớm",
  MISSED_CHECK: "Quên chấm công",
};

export const ATTENDANCE_REQUEST_STATUS_LABELS: Record<AttendanceRequestStatus, string> = {
  PENDING_MANAGER: "Chờ quản lý duyệt",
  PENDING_HR: "Chờ HCNS duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã huỷ",
};

export const DAY_PORTION_LABELS: Record<AttendanceDayPortion, string> = {
  FULL: "Cả ngày",
  MORNING: "Buổi sáng",
  AFTERNOON: "Buổi chiều",
};

export const LEAVE_TYPES: AttendanceRequestType[] = ["ANNUAL_LEAVE", "SICK_LEAVE", "UNPAID_LEAVE"];

// ------------------------------------------------------------
// Giờ Việt Nam — không phụ thuộc múi giờ của server.
// ------------------------------------------------------------
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// "yyyy-MM-dd" theo giờ Việt Nam của 1 thời điểm.
export function vnDateKey(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

// Số phút kể từ 00:00 giờ Việt Nam của 1 thời điểm.
export function vnMinutesOfDay(d: Date): number {
  const v = new Date(d.getTime() + VN_OFFSET_MS);
  return v.getUTCHours() * 60 + v.getUTCMinutes();
}

// "HH:mm" theo giờ Việt Nam.
export function vnTimeLabel(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(11, 16);
}

// Ngày làm việc lưu DB = UTC-midnight của ngày VN ("yyyy-MM-dd").
export function toAttendanceWorkDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

// Thời điểm thật của "HH:mm" giờ VN trong ngày key.
export function vnDateTime(key: string, hhmm: string): Date {
  return new Date(`${key}T${hhmm}:00.000+07:00`);
}

export function parseHhmm(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Danh sách "yyyy-MM-dd" từ start..end (bao gồm 2 đầu).
export function dateKeysBetween(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  for (let t = toAttendanceWorkDate(startKey).getTime(); t <= toAttendanceWorkDate(endKey).getTime(); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function isSundayKey(key: string): boolean {
  return toAttendanceWorkDate(key).getUTCDay() === 0;
}

// ------------------------------------------------------------
// GPS
// ------------------------------------------------------------
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// ------------------------------------------------------------
// Bảng công
// ------------------------------------------------------------
export type AttendanceDayStatus =
  | "FUTURE" // chưa tới
  | "OFF" // Chủ nhật
  | "HOLIDAY" // ngày lễ
  | "WORK" // đủ vào + ra
  | "MISSING_OUT" // có vào, thiếu ra
  | "MISSING_IN" // có ra, thiếu vào
  | "LEAVE" // nghỉ có đơn được duyệt (cả ngày)
  | "ABSENT"; // không chấm, không đơn

export type AttendanceDayCell = {
  date: string;
  status: AttendanceDayStatus;
  workUnits: number; // công tính cho ngày này (0 / 0.5 / 1)
  checkIn: string | null; // "HH:mm"
  checkOut: string | null;
  lateMinutes: number; // sau khi trừ phần đã có đơn LATE_EARLY duyệt
  earlyMinutes: number;
  leaveType: AttendanceRequestType | null;
  leaveUnits: number; // 0 / 0.5 / 1
  fixedByRequest: boolean; // giờ vào/ra được bổ sung từ đơn Quên chấm công
  recordId: string | null;
};

export type AttendanceSummary = {
  workUnits: number;
  paidLeaveUnits: number; // nghỉ phép năm
  sickLeaveUnits: number;
  unpaidLeaveUnits: number;
  lateCount: number;
  lateMinutes: number;
  earlyCount: number;
  earlyMinutes: number;
  missingCount: number;
  absentCount: number;
};

type RecordInput = {
  id: string;
  workDate: Date;
  shiftStart: string;
  shiftEnd: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  lateMinutes: number;
  earlyMinutes: number;
};

type RequestInput = {
  type: AttendanceRequestType;
  startDate: Date;
  endDate: Date;
  dayPortion: AttendanceDayPortion;
  lateMinutes: number | null;
  earlyMinutes: number | null;
  missedCheckIn: string | null;
  missedCheckOut: string | null;
};

// Tính bảng công 1 NV cho danh sách ngày — chỉ dùng đơn ĐÃ DUYỆT (APPROVED). Đơn Quên chấm công bổ sung
// giờ vào/ra còn thiếu; đơn Đi muộn/về sớm trừ bớt số phút muộn/sớm; đơn nghỉ đánh dấu ngày nghỉ.
export function buildAttendanceDays(params: {
  dateKeys: string[];
  todayKey: string;
  holidayKeys: Set<string>;
  records: RecordInput[];
  approvedRequests: RequestInput[];
  shift: { shiftStart: string; shiftEnd: string; graceMinutes: number } | null;
}): { days: AttendanceDayCell[]; summary: AttendanceSummary } {
  const { dateKeys, todayKey, holidayKeys, records, approvedRequests, shift } = params;
  const recordByKey = new Map(records.map((r) => [r.workDate.toISOString().slice(0, 10), r]));
  const grace = shift?.graceMinutes ?? 0;

  const summary: AttendanceSummary = {
    workUnits: 0, paidLeaveUnits: 0, sickLeaveUnits: 0, unpaidLeaveUnits: 0,
    lateCount: 0, lateMinutes: 0, earlyCount: 0, earlyMinutes: 0, missingCount: 0, absentCount: 0,
  };

  const days = dateKeys.map((key): AttendanceDayCell => {
    const record = recordByKey.get(key) ?? null;
    const reqsToday = approvedRequests.filter((r) => {
      const s = r.startDate.toISOString().slice(0, 10);
      const e = r.endDate.toISOString().slice(0, 10);
      return key >= s && key <= e;
    });
    const leave = reqsToday.find((r) => LEAVE_TYPES.includes(r.type)) ?? null;
    const leaveUnits = leave ? (leave.dayPortion === "FULL" ? 1 : 0.5) : 0;
    const missed = reqsToday.find((r) => r.type === "MISSED_CHECK") ?? null;
    const lateEarly = reqsToday.filter((r) => r.type === "LATE_EARLY");

    const cell: AttendanceDayCell = {
      date: key, status: "ABSENT", workUnits: 0, checkIn: null, checkOut: null, lateMinutes: 0, earlyMinutes: 0,
      leaveType: leave?.type ?? null, leaveUnits, fixedByRequest: false, recordId: record?.id ?? null,
    };

    const isSunday = isSundayKey(key);
    const isHoliday = holidayKeys.has(key);
    if (isSunday || isHoliday) {
      cell.status = isHoliday ? "HOLIDAY" : "OFF";
      // Vẫn hiện giờ nếu có đi làm Chủ nhật/ngày lễ (làm thêm) — không tính công thường.
      if (record?.checkInAt) cell.checkIn = vnTimeLabel(record.checkInAt);
      if (record?.checkOutAt) cell.checkOut = vnTimeLabel(record.checkOutAt);
      return cell;
    }

    let checkIn = record?.checkInAt ? vnTimeLabel(record.checkInAt) : null;
    let checkOut = record?.checkOutAt ? vnTimeLabel(record.checkOutAt) : null;
    if (missed) {
      if (!checkIn && missed.missedCheckIn) { checkIn = missed.missedCheckIn; cell.fixedByRequest = true; }
      if (!checkOut && missed.missedCheckOut) { checkOut = missed.missedCheckOut; cell.fixedByRequest = true; }
    }
    cell.checkIn = checkIn;
    cell.checkOut = checkOut;

    // Muộn/sớm: dùng số phút đã lưu lúc chấm (theo ca lúc đó); giờ bổ sung từ đơn quên chấm thì tính lại
    // theo ca hiện tại của khu.
    const shiftStart = record?.shiftStart ?? shift?.shiftStart ?? null;
    const shiftEnd = record?.shiftEnd ?? shift?.shiftEnd ?? null;
    let late = record?.checkInAt ? record.lateMinutes : checkIn && shiftStart ? Math.max(0, parseHhmm(checkIn) - parseHhmm(shiftStart) - grace) : 0;
    let early = record?.checkOutAt ? record.earlyMinutes : checkOut && shiftEnd ? Math.max(0, parseHhmm(shiftEnd) - parseHhmm(checkOut) - grace) : 0;
    // Nghỉ nửa ngày thì không tính muộn (nghỉ sáng) / về sớm (nghỉ chiều).
    if (leave?.dayPortion === "MORNING") late = 0;
    if (leave?.dayPortion === "AFTERNOON") early = 0;
    for (const r of lateEarly) {
      late = Math.max(0, late - (r.lateMinutes ?? 0));
      early = Math.max(0, early - (r.earlyMinutes ?? 0));
    }
    cell.lateMinutes = late;
    cell.earlyMinutes = early;

    if (leave && leave.dayPortion === "FULL") {
      cell.status = "LEAVE";
    } else if (checkIn && checkOut) {
      cell.status = "WORK";
      cell.workUnits = leave ? 0.5 : 1;
    } else if (checkIn || checkOut) {
      // Hôm nay mới chấm vào, chưa tới lúc chấm ra — chưa coi là thiếu.
      cell.status = key === todayKey && checkIn && !checkOut ? "WORK" : checkIn ? "MISSING_OUT" : "MISSING_IN";
    } else if (key > todayKey || (key === todayKey && !record)) {
      cell.status = leave ? "LEAVE" : "FUTURE";
    } else {
      cell.status = leave ? "LEAVE" : "ABSENT";
    }

    // Tổng hợp
    summary.workUnits += cell.workUnits;
    if (leave?.type === "ANNUAL_LEAVE") summary.paidLeaveUnits += leaveUnits;
    if (leave?.type === "SICK_LEAVE") summary.sickLeaveUnits += leaveUnits;
    if (leave?.type === "UNPAID_LEAVE") summary.unpaidLeaveUnits += leaveUnits;
    if (cell.lateMinutes > 0) { summary.lateCount += 1; summary.lateMinutes += cell.lateMinutes; }
    if (cell.earlyMinutes > 0) { summary.earlyCount += 1; summary.earlyMinutes += cell.earlyMinutes; }
    if (cell.status === "MISSING_IN" || cell.status === "MISSING_OUT") summary.missingCount += 1;
    if (cell.status === "ABSENT") summary.absentCount += 1;
    return cell;
  });

  return { days, summary };
}

// Số ngày công của 1 đơn nghỉ — bỏ Chủ nhật và ngày lễ, nửa ngày = 0.5.
export function countLeaveDays(startKey: string, endKey: string, dayPortion: AttendanceDayPortion, holidayKeys: Set<string>): number {
  const workingKeys = dateKeysBetween(startKey, endKey).filter((k) => !isSundayKey(k) && !holidayKeys.has(k));
  if (workingKeys.length === 0) return 0;
  return dayPortion === "FULL" ? workingKeys.length : 0.5;
}
