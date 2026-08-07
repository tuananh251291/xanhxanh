import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { startOfDay, endOfDay, parse, isValid } from "date-fns";

// Danh sách NV cấy mô (cả 2 luồng) thuộc kho của Kho mô đang đăng nhập CÓ lô nhập vào Phòng tối cá nhân
// đúng ngày được chọn (Lot.darkRoomEnteredAt) nhưng lô đó VẪN CÒN nằm ở phòng tối, CHƯA bàn giao — cùng
// tiêu chí "còn nằm trong phòng tối chờ bàn giao" mà /api/lots?roomType=PHONG_TOI đang dùng cho trang
// /my-dark-room (status ACTIVE + chưa có TransferItem nào thuộc phiếu PENDING — phiếu bị từ chối
// (REJECTED) thì lô coi như quay lại "chưa bàn giao").
// Query param "date" (yyyy-MM-dd, tùy chọn) — mặc định hôm nay. Không cho chọn ngày tương lai.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const dateParam = req.nextUrl.searchParams.get("date");
  const today = new Date();
  const parsedDate = dateParam ? parse(dateParam, "yyyy-MM-dd", today) : today;
  const targetDate = isValid(parsedDate) ? parsedDate : today;
  if (startOfDay(targetDate) > startOfDay(today)) {
    return NextResponse.json({ message: "Không thể kiểm tra ngày trong tương lai" }, { status: 400 });
  }
  const rangeStart = startOfDay(targetDate);
  const rangeEnd = endOfDay(targetDate);

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", workplaceWarehouseId, isActive: true },
    select: { id: true, code: true, name: true, inspectionLane: true },
    orderBy: { code: "asc" },
  });

  const entriesThatDay = await prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      room: { type: "PHONG_TOI", assignedStaffId: { in: staffList.map((s) => s.id) } },
      darkRoomEnteredAt: { gte: rangeStart, lte: rangeEnd },
    },
    select: { room: { select: { assignedStaffId: true } }, transferItems: { select: { transfer: { select: { status: true } } } } },
  });

  const staffWithEntries = new Set<string>();
  const staffStillPending = new Set<string>();
  for (const lot of entriesThatDay) {
    const staffId = lot.room?.assignedStaffId;
    if (!staffId) continue;
    staffWithEntries.add(staffId);
    const notYetHandedOver = !lot.transferItems.some((i) => i.transfer.status === "PENDING");
    if (notYetHandedOver) staffStillPending.add(staffId);
  }

  const missingStaff = staffList.filter((s) => staffStillPending.has(s.id));

  return NextResponse.json({
    date: dateParam ?? rangeStart.toISOString().slice(0, 10),
    totalWithEntries: staffWithEntries.size,
    missingStaff: missingStaff.map((s) => ({ id: s.id, code: s.code, name: s.name, inspectionLane: s.inspectionLane })),
  });
}
