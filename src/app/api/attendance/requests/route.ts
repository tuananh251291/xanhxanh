import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  ATTENDANCE_REQUEST_TYPE_LABELS,
  HHMM_REGEX,
  LEAVE_TYPES,
  countLeaveDays,
  isAttendanceRole,
  toAttendanceWorkDate,
} from "@/lib/attendance";
import {
  getAnnualLeaveUsage,
  getApproverWarehouseIds,
  getStaffAttendanceContext,
  isAttendanceHr,
  loadHolidayKeys,
  resolveManagerApprover,
} from "@/lib/attendance-server";

const DATE_KEY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");

const createSchema = z
  .object({
    type: z.enum(["ANNUAL_LEAVE", "SICK_LEAVE", "UNPAID_LEAVE", "LATE_EARLY", "MISSED_CHECK"]),
    startDate: DATE_KEY,
    endDate: DATE_KEY.optional(),
    dayPortion: z.enum(["FULL", "MORNING", "AFTERNOON"]).default("FULL"),
    lateMinutes: z.number().int().min(0).max(600).optional(),
    earlyMinutes: z.number().int().min(0).max(600).optional(),
    missedCheckIn: z.string().regex(HHMM_REGEX, "Giờ vào không hợp lệ").optional(),
    missedCheckOut: z.string().regex(HHMM_REGEX, "Giờ ra không hợp lệ").optional(),
    reason: z.string().trim().min(3, "Nhập lý do (ít nhất 3 ký tự)").max(500),
  })
  .superRefine((v, ctx) => {
    const end = v.endDate ?? v.startDate;
    if (end < v.startDate) ctx.addIssue({ code: "custom", message: "Ngày kết thúc phải sau ngày bắt đầu" });
    if (v.dayPortion !== "FULL" && end !== v.startDate) {
      ctx.addIssue({ code: "custom", message: "Nghỉ nửa ngày chỉ áp dụng cho đơn 1 ngày" });
    }
    if (v.type === "LATE_EARLY" && !v.lateMinutes && !v.earlyMinutes) {
      ctx.addIssue({ code: "custom", message: "Nhập số phút đi muộn hoặc về sớm" });
    }
    if (v.type === "MISSED_CHECK" && !v.missedCheckIn && !v.missedCheckOut) {
      ctx.addIssue({ code: "custom", message: "Nhập giờ vào hoặc giờ ra thực tế" });
    }
  });

const listSelect = {
  id: true, type: true, status: true, startDate: true, endDate: true, dayPortion: true, leaveDays: true,
  lateMinutes: true, earlyMinutes: true, missedCheckIn: true, missedCheckOut: true, reason: true,
  managerNote: true, managerAt: true, hrNote: true, hrAt: true, createdAt: true, warehouseId: true,
  user: { select: { id: true, name: true, code: true, role: true, workplaceWarehouse: { select: { name: true } } } },
  manager: { select: { name: true } },
  hr: { select: { name: true } },
} satisfies Prisma.AttendanceRequestSelect;

// GET — danh sách đơn cho người duyệt: quản lý khu thấy đơn của các khu mình được gán duyệt cấp 1; HCNS
// thấy mọi đơn. ?status=pending (mặc định: đơn đang chờ mình) | all, ?month=yyyy-MM (lọc theo ngày bắt đầu).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  const isHr = isAttendanceHr(session.user.role);
  const managerWarehouseIds = await getApproverWarehouseIds(session.user.id);
  if (!isHr && managerWarehouseIds.length === 0) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const statusFilter = sp.get("status") ?? "pending";
  const month = sp.get("month");
  const warehouseId = sp.get("warehouseId");

  const scope: Prisma.AttendanceRequestWhereInput = isHr ? {} : { warehouseId: { in: managerWarehouseIds } };
  const where: Prisma.AttendanceRequestWhereInput = {
    ...scope,
    ...(warehouseId ? { warehouseId } : {}),
    ...(statusFilter === "pending"
      ? isHr
        ? { status: { in: ["PENDING_HR", "PENDING_MANAGER"] } }
        : { status: "PENDING_MANAGER", managerId: session.user.id }
      : {}),
    ...(month && /^\d{4}-\d{2}$/.test(month)
      ? { startDate: { gte: toAttendanceWorkDate(`${month}-01`), lt: toAttendanceWorkDate(nextMonthKey(month)) } }
      : {}),
  };

  const requests = await prisma.attendanceRequest.findMany({ where, select: listSelect, orderBy: { createdAt: "desc" }, take: 300 });
  return NextResponse.json({ requests, isHr, managerWarehouseIds });
}

function nextMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

// POST — NV gửi đơn. Có người duyệt cấp 1 của khu thì chờ quản lý duyệt, không thì lên thẳng HCNS.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAttendanceRole(session?.user?.role)) {
    return NextResponse.json({ message: "Vai trò của bạn không chấm công trên phần mềm" }, { status: 403 });
  }
  const userId = session!.user.id;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const v = parsed.data;
  const isLeave = LEAVE_TYPES.includes(v.type);
  const endKey = isLeave ? (v.endDate ?? v.startDate) : v.startDate;
  const dayPortion = isLeave ? v.dayPortion : "FULL";

  let leaveDays = 0;
  if (isLeave) {
    const holidayKeys = await loadHolidayKeys(v.startDate, endKey);
    leaveDays = countLeaveDays(v.startDate, endKey, dayPortion, holidayKeys);
    if (leaveDays === 0) {
      return NextResponse.json({ message: "Khoảng ngày chọn toàn Chủ nhật/ngày lễ — không cần xin nghỉ" }, { status: 400 });
    }
    if (v.type === "ANNUAL_LEAVE") {
      const usage = await getAnnualLeaveUsage(userId, Number(v.startDate.slice(0, 4)));
      if (leaveDays > usage.remaining) {
        return NextResponse.json(
          { message: `Quỹ phép năm còn ${usage.remaining} ngày (kể cả đơn đang chờ duyệt), không đủ ${leaveDays} ngày` },
          { status: 400 }
        );
      }
    }
  }

  // Chặn đơn nghỉ trùng ngày với đơn nghỉ khác còn hiệu lực.
  if (isLeave) {
    const overlap = await prisma.attendanceRequest.findFirst({
      where: {
        userId,
        type: { in: LEAVE_TYPES },
        status: { in: ["PENDING_MANAGER", "PENDING_HR", "APPROVED"] },
        startDate: { lte: toAttendanceWorkDate(endKey) },
        endDate: { gte: toAttendanceWorkDate(v.startDate) },
      },
      select: { id: true },
    });
    if (overlap) return NextResponse.json({ message: "Đã có đơn nghỉ khác trùng ngày" }, { status: 400 });
  }

  const ctx = await getStaffAttendanceContext(userId);
  const warehouseId = ctx?.workplaceWarehouse?.id ?? null;
  const managerId = await resolveManagerApprover(warehouseId, userId);

  const request = await prisma.attendanceRequest.create({
    data: {
      userId,
      warehouseId,
      type: v.type,
      status: managerId ? "PENDING_MANAGER" : "PENDING_HR",
      managerId,
      startDate: toAttendanceWorkDate(v.startDate),
      endDate: toAttendanceWorkDate(endKey),
      dayPortion,
      leaveDays,
      lateMinutes: v.type === "LATE_EARLY" ? (v.lateMinutes ?? null) : null,
      earlyMinutes: v.type === "LATE_EARLY" ? (v.earlyMinutes ?? null) : null,
      missedCheckIn: v.type === "MISSED_CHECK" ? (v.missedCheckIn ?? null) : null,
      missedCheckOut: v.type === "MISSED_CHECK" ? (v.missedCheckOut ?? null) : null,
      reason: v.reason,
    },
    select: { id: true, status: true },
  });

  await prisma.alert.create({
    data: {
      type: "ATTENDANCE_REQUEST",
      title: `Đơn ${ATTENDANCE_REQUEST_TYPE_LABELS[v.type].toLowerCase()} cần duyệt`,
      message: `${ctx?.name ?? "NV"}${ctx?.workplaceWarehouse ? ` (${ctx.workplaceWarehouse.name})` : ""} gửi đơn ${ATTENDANCE_REQUEST_TYPE_LABELS[v.type].toLowerCase()} — ${v.reason}`,
      ...(managerId ? { userId: managerId } : { targetRole: "HANH_CHINH_NHAN_SU" }),
      relatedId: request.id,
      relatedType: "AttendanceRequest",
    },
  });

  return NextResponse.json(request, { status: 201 });
}
