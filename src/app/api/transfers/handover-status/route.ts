import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { startOfDay, endOfDay, parse, isValid } from "date-fns";

// Danh sách NV cấy mô (cả 2 luồng) thuộc kho của Kho mô đang đăng nhập CHƯA tạo phiếu bàn giao Phòng
// tối nào trong 1 ngày cụ thể (bất kể Kho mô đã xác nhận nhận hay chưa) — dùng để Kho mô chủ động nhắc
// NV, không phụ thuộc việc phiếu đã xử lý xong tới đâu.
// Query param "date" (yyyy-MM-dd, tùy chọn) — mặc định hôm nay. Không cho chọn ngày tương lai (chưa có
// ý nghĩa "chưa bàn giao").
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

  const handedOver = await prisma.transfer.findMany({
    where: {
      fromUserId: { in: staffList.map((s) => s.id) },
      fromRoom: { type: "PHONG_TOI" },
      createdAt: { gte: rangeStart, lte: rangeEnd },
    },
    select: { fromUserId: true },
    distinct: ["fromUserId"],
  });
  const handedOverIds = new Set(handedOver.map((t) => t.fromUserId));

  const missingStaff = staffList.filter((s) => !handedOverIds.has(s.id));

  return NextResponse.json({
    date: dateParam ?? rangeStart.toISOString().slice(0, 10),
    totalStaff: staffList.length,
    missingStaff: missingStaff.map((s) => ({ id: s.id, code: s.code, name: s.name, inspectionLane: s.inspectionLane })),
  });
}
