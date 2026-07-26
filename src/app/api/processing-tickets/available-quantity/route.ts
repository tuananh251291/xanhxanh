import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQualifiedLots } from "@/lib/order-availability";
import { getFinishedQualifiedRooms } from "@/lib/processing";

// Chỉ dùng để hiện "Tồn đạt tiêu chuẩn: X" ngay trên form trước khi bấm "Tạo phiếu xử lý" — KHÔNG chặn
// submit ở đây, POST /api/processing-tickets tự đọc lại tồn tươi trong transaction mới là nơi chặn thật.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");
  const plantTypeId = searchParams.get("plantTypeId");
  const stageCode = searchParams.get("stageCode");
  if (!roomId || !plantTypeId || !stageCode) {
    return NextResponse.json({ message: "Thiếu tham số" }, { status: 400 });
  }

  const validRooms = await getFinishedQualifiedRooms();
  if (!validRooms.some((r) => r.id === roomId)) {
    return NextResponse.json({ message: "Phòng không hợp lệ" }, { status: 400 });
  }

  const lots = await getQualifiedLots([roomId], plantTypeId, stageCode);
  const available = lots.reduce((s, l) => s + l.available, 0);
  return NextResponse.json({ available });
}
