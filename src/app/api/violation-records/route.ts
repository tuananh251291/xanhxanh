import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { computeViolationPointsApplied } from "@/lib/violation-points";
import { resolvePayrollPeriod } from "@/lib/payroll-period";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const createSchema = z.object({
  staffId: z.string().min(1),
  violationTypeId: z.string().min(1),
  // Kỳ lương áp dụng (tuỳ chọn, "yyyy-MM") — dùng khi ghi bù/ghi lùi cho 1 kỳ trước, xem
  // record-violation-recovery-board.tsx. Không truyền = ghi ngay lúc này (hành vi cũ, giữ nguyên).
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Kỳ phải theo dạng yyyy-MM").optional(),
});

// Ghi nhận vi phạm TRỰC TIẾP cho 1 NV cấy mô — không cần qua 1 lượt "Kiểm tra kho tối" nào (khác luồng
// cũ ở /api/dark-room-inspection). Dùng cho Kho mô/Kỹ thuật/NV Hành chính nhân sự/Admin/Admin cấp cao —
// những vai trò trực tiếp làm việc/giám sát NV cấy mô, đủ điều kiện phát hiện vi phạm ngay khi thấy.
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KHO_MO" && role !== "KY_THUAT" && role !== "HANH_CHINH_NHAN_SU") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { staffId, violationTypeId, periodMonth } = parsed.data;

  const [staff, violationType] = await Promise.all([
    prisma.user.findUnique({ where: { id: staffId }, select: { id: true, role: true, name: true } }),
    prisma.violationType.findUnique({ where: { id: violationTypeId }, select: { id: true, isActive: true, label: true, points: true } }),
  ]);
  if (!staff || staff.role !== "CAY_MO") {
    return NextResponse.json({ message: "Không tìm thấy NV cấy mô" }, { status: 400 });
  }
  if (!violationType || !violationType.isActive) {
    return NextResponse.json({ message: "Không tìm thấy loại lỗi vi phạm" }, { status: 400 });
  }

  const now = periodMonth ? resolvePayrollPeriod(periodMonth).rangeStart : new Date();
  const pointsApplied = await computeViolationPointsApplied(staffId, violationTypeId, violationType.points, now);

  const record = await prisma.violationRecord.create({
    data: { staffId, createdById: session!.user!.id, violationTypeId, pointsApplied, createdAt: now },
    include: { violationType: { select: { label: true } } },
  });

  try {
    await createAlert({
      type: "NV_VIOLATION",
      title: "Bạn vừa bị ghi nhận vi phạm",
      message: `Lỗi: ${record.violationType.label}`,
      userId: staffId,
      relatedId: record.id,
      relatedType: "ViolationRecord",
    });
  } catch (err) {
    console.error("[violation-records] Không gửi được thông báo NV_VIOLATION:", err);
  }

  return NextResponse.json(record, { status: 201 });
}
