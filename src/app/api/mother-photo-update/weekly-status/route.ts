import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfWeek, addWeeks, addDays, endOfDay } from "date-fns";
import { toStoredWeekStart } from "@/lib/week-rotation";

const WEEKS_SHOWN = 8;

// Bảng "Lịch sử hoàn thành nhiệm vụ tuần" cho trang Xem dữ liệu hình ảnh — tính LIVE từ MotherPhoto,
// không có bảng "nhiệm vụ" riêng (xem prisma/schema.prisma, model MotherPhoto).
//
// Xấp xỉ: tổng số loại cây "đang sản xuất" dùng để tính % mỗi tuần lấy theo trạng thái HIỆN TẠI (không
// tra cứu lại được trạng thái sản xuất của các tuần trong quá khứ) — chấp nhận được vì mục đích bảng này
// là xem NHANH đã làm/chưa làm, không phải báo cáo kiểm toán chính xác tuyệt đối theo từng tuần cũ.
export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KY_THUAT" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const [staff, activePlantTypes] = await Promise.all([
    prisma.user.findMany({
      where: { role: "KY_THUAT", isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.lot.findMany({
      // Chỉ tính giàn ĐÃ GẮN cho nhân sự — không cần cập nhật ảnh cho lô ở "kệ chung".
      where: { stage: "MAU_ME", status: "ACTIVE", quantity: { gt: 0 }, shelf: { assignedStaffId: { not: null } } },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
  ]);
  const totalPlantTypes = activePlantTypes.length;

  const thisWeekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekStarts = Array.from({ length: WEEKS_SHOWN }, (_, i) => addWeeks(thisWeekStart, -i));

  const photos = await prisma.motherPhoto.findMany({
    where: {
      takenById: { in: staff.map((s) => s.id) },
      weekStart: { in: weekStarts },
    },
    select: { takenById: true, weekStart: true, plantTypeId: true, createdAt: true },
  });

  const rows = staff.map((s) => {
    const weeks = weekStarts.map((weekStart) => {
      const tuesdayEnd = endOfDay(addDays(weekStart, 1));
      const weekPhotos = photos.filter(
        (p) => p.takenById === s.id && p.weekStart.getTime() === weekStart.getTime()
      );
      const distinctPlantTypes = new Set(weekPhotos.map((p) => p.plantTypeId));
      const percent = totalPlantTypes === 0 ? 100 : Math.round((distinctPlantTypes.size / totalPlantTypes) * 100);
      const isFullyDone = totalPlantTypes === 0 ? weekPhotos.length > 0 : distinctPlantTypes.size >= totalPlantTypes;
      const doneByTuesday = isFullyDone && weekPhotos.every((p) => p.createdAt <= tuesdayEnd);

      let status: "HOAN_THANH" | "DA_THUC_HIEN" | "CHUA_LAM";
      if (isFullyDone) status = doneByTuesday ? "HOAN_THANH" : "DA_THUC_HIEN";
      else if (weekPhotos.length > 0) status = "DA_THUC_HIEN";
      else status = "CHUA_LAM";

      return { weekStart, percent, status };
    });
    return { userId: s.id, name: s.name, code: s.code, weeks };
  });

  return NextResponse.json({ weekStarts, totalPlantTypes, rows });
}
