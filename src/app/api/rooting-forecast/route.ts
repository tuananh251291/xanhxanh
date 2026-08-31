import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTaskMonth, getForecastStatus } from "@/lib/rooting-forecast";

// Nhiệm vụ tháng "Dự kiến đáp ứng cây ra rễ" — chỉ NV Kỹ thuật (KY_THUAT) đã được gán cơ sở sản xuất
// (workplaceWarehouseId) mới xem được, đúng cơ sở của chính mình (không truyền warehouseId từ client).
// Nộp lần đầu: POST /api/rooting-forecast/submit. Sau khi nộp (isLocked=true) chỉ còn sửa được qua
// POST /api/rooting-forecast-edit-proposals (Admin duyệt). Xem src/lib/rooting-forecast.ts.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Chỉ áp dụng cho NV Kỹ thuật" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) {
    return NextResponse.json({ message: "Chưa được Admin cấp cao gán cơ sở sản xuất" }, { status: 400 });
  }

  const taskMonth = getTaskMonth();
  const status = await getForecastStatus(warehouseId, taskMonth);
  return NextResponse.json(status);
}
