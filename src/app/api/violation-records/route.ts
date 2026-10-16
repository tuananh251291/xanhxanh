import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isViolationCheckerRole } from "@/types";
import { computeViolationPointsApplied, findSameDayViolationByOtherChecker, sameDayViolationMessage } from "@/lib/violation-points";
import { resolvePayrollPeriod } from "@/lib/payroll-period";
import { createAlert } from "@/lib/inventory";
import { uploadViolationPhotos } from "@/lib/violation-photo-storage";
import { MAX_VIOLATION_PHOTOS, MAX_VIOLATION_PHOTO_DATA_URL_LENGTH } from "@/lib/violation-photo-constants";
import { z } from "zod";

const createSchema = z.object({
  staffId: z.string().min(1),
  violationTypeId: z.string().min(1),
  // Kỳ lương áp dụng (tuỳ chọn, "yyyy-MM") — dùng khi ghi bù/ghi lùi cho 1 kỳ trước, xem
  // record-violation-recovery-board.tsx. Không truyền = ghi ngay lúc này (hành vi cũ, giữ nguyên).
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Kỳ phải theo dạng yyyy-MM").optional(),
  // Ảnh bằng chứng (tối đa 3, bắt buộc nếu loại lỗi requiresPhoto) — data URL đã nén + đóng dấu giờ chụp ở client, tải lên lúc ghi nhận.
  photos: z.array(z.string().max(MAX_VIOLATION_PHOTO_DATA_URL_LENGTH)).max(MAX_VIOLATION_PHOTOS).optional(),
});

// Ghi nhận vi phạm TRỰC TIẾP cho 1 NV cấy mô — không cần qua 1 lượt "Kiểm tra kho tối" nào (khác luồng
// cũ ở /api/dark-room-inspection). Dùng cho Kho mô/Kỹ thuật/NV Hành chính nhân sự/Admin/Admin cấp cao —
// những vai trò trực tiếp làm việc/giám sát NV cấy mô, đủ điều kiện phát hiện vi phạm ngay khi thấy.
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && !isViolationCheckerRole(role) && role !== "KY_THUAT" && role !== "HANH_CHINH_NHAN_SU") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { staffId, violationTypeId, periodMonth, photos = [] } = parsed.data;

  const [staff, violationType] = await Promise.all([
    prisma.user.findUnique({ where: { id: staffId }, select: { id: true, role: true, name: true } }),
    prisma.violationType.findUnique({ where: { id: violationTypeId }, select: { id: true, isActive: true, label: true, points: true, requiresPhoto: true } }),
  ]);
  if (!staff || staff.role !== "CAY_MO") {
    return NextResponse.json({ message: "Không tìm thấy NV cấy mô" }, { status: 400 });
  }
  if (!violationType || !violationType.isActive) {
    return NextResponse.json({ message: "Không tìm thấy loại lỗi vi phạm" }, { status: 400 });
  }

  // Kỳ chọn là kỳ hiện tại (mặc định của form) thì ghi đúng lúc này — chỉ ghi lùi về đầu kỳ khi chọn kỳ
  // KHÁC. Trước đây luôn lấy đầu kỳ nên mọi vi phạm ghi trong tháng đều mang ngày mùng 1, mất ngày thật.
  const realNow = new Date();
  const period = periodMonth ? resolvePayrollPeriod(periodMonth) : null;
  const isBackdated = !!period && (realNow < period.rangeStart || realNow >= period.rangeEnd);
  const now = isBackdated ? period!.rangeStart : realNow;

  if (!isBackdated) {
    const dup = await findSameDayViolationByOtherChecker(staffId, [violationTypeId], session!.user!.id, now);
    if (dup) return NextResponse.json({ message: sameDayViolationMessage(dup, staff.name) }, { status: 409 });
  }

  // Ảnh chỉ giữ 14 ngày tính từ createdAt — ghi lùi về đầu kỳ cũ thì ảnh sẽ bị xoá ngay đêm đó, nên chặn.
  if (isBackdated && photos.length > 0) {
    return NextResponse.json({ message: "Chỉ đính kèm hình ảnh khi ghi lỗi cho kỳ hiện tại" }, { status: 400 });
  }
  // Ghi lùi kỳ cũ không đính kèm ảnh được (xem trên) nên bỏ qua yêu cầu bắt buộc ảnh trong trường hợp đó.
  if (!isBackdated && violationType.requiresPhoto && photos.length === 0) {
    return NextResponse.json({ message: `Lỗi "${violationType.label}" bắt buộc chụp ảnh bằng chứng` }, { status: 400 });
  }

  const pointsApplied = await computeViolationPointsApplied(staffId, violationTypeId, violationType.points, now);

  let photoUrls: string[];
  try {
    photoUrls = await uploadViolationPhotos(photos, staffId);
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "Tải ảnh lên thất bại" }, { status: 500 });
  }

  const record = await prisma.violationRecord.create({
    data: { staffId, createdById: session!.user!.id, violationTypeId, pointsApplied, createdAt: now, photoUrls },
    include: { violationType: { select: { label: true } } },
  });

  try {
    await createAlert({
      type: "NV_VIOLATION",
      title: "Bạn vừa bị ghi nhận vi phạm",
      message: `Lỗi: ${record.violationType.label}${photoUrls.length ? ` (kèm hình ảnh)` : ""}`,
      userId: staffId,
      relatedId: record.id,
      relatedType: "ViolationRecord",
    });
  } catch (err) {
    console.error("[violation-records] Không gửi được thông báo NV_VIOLATION:", err);
  }

  return NextResponse.json(record, { status: 201 });
}
