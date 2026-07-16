import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccessibleRoomIds, getAvailableLots } from "@/lib/order-availability";

const FINISHED_STAGE_CODES = new Set(["T01", "T05", "T10"]);

// Tra nhanh tồn khả dụng cho 1 tổ hợp loại cây + quy cách — dùng để hiện "Số lượng khả dụng" ngay khi
// Sale chọn loại cây/quy cách trên form Check, không cần đợi nhập số lượng nhu cầu rồi bấm "Check"
// (khác POST /api/orders/check, vốn cần cả số lượng để tính đề xuất thay thế quy cách khác).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được chức năng này" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const plantTypeId = searchParams.get("plantTypeId");
  const stageCode = searchParams.get("stageCode");
  if (!plantTypeId || !stageCode) {
    return NextResponse.json({ message: "Thiếu plantTypeId hoặc stageCode" }, { status: 400 });
  }
  if (!FINISHED_STAGE_CODES.has(stageCode)) {
    return NextResponse.json({ message: `Quy cách "${stageCode}" không hợp lệ (T01/T05/T10)` }, { status: 400 });
  }

  const roomIds = await getAccessibleRoomIds(session.user.id, session.user.workplaceWarehouseId);
  const lots = await getAvailableLots(roomIds, plantTypeId, stageCode);
  const available = lots.reduce((s, l) => s + l.available, 0);

  return NextResponse.json({ available });
}
