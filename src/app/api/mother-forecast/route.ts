import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTaskMonth, getForecastStatus, computeMotherShortfallRows } from "@/lib/mother-forecast";

// Nhiệm vụ tháng "Dự kiến đáp ứng mẫu mẹ" — chỉ NV Kỹ thuật (KY_THUAT) đã được gán cơ sở sản xuất
// (workplaceWarehouseId) mới xem được, đúng cơ sở của chính mình. Nộp lần đầu: POST
// /api/mother-forecast/submit. Sau khi nộp (isLocked=true) chỉ còn sửa được qua POST
// /api/mother-forecast-edit-proposals (Admin kỹ thuật/Admin cấp cao duyệt). Kèm `shortfallRows` — các
// dòng (mã cây, NV cấy mô) đang tụt dưới 90% kế hoạch tháng hiện tại, xem src/lib/mother-forecast.ts.
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
  const [status, shortfallRows] = await Promise.all([
    getForecastStatus(warehouseId, taskMonth),
    computeMotherShortfallRows(warehouseId),
  ]);
  return NextResponse.json({ ...status, shortfallRows });
}
