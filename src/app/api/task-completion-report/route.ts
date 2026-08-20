import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getTaskCompletionReport } from "@/lib/task-completion-report";
import { startOfWeek, isValid, parseISO } from "date-fns";

// Báo cáo "Số ngày không hoàn thành nhiệm vụ" — Admin xem toàn bộ (lọc thêm được theo 1 cơ sở sản xuất
// qua ?warehouseId=, xem WarehouseFilterSelect — riêng NV kỹ thuật luôn hiện đủ dù có lọc vì không gán
// theo kho, xem task-completion-report.ts), Kho mô chỉ xem đúng NV cùng kho sản xuất mình làm việc (bỏ
// qua ?warehouseId= nếu có gửi lên). NV Hành chính nhân sự (chỉ xem) xem toàn bộ như Admin — không gán
// theo kho sản xuất, cũng lọc được theo ?warehouseId=.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  const isHr = role === "HANH_CHINH_NHAN_SU";
  const canFilterByWarehouse = isAdminRole(role) || isHr;
  if (!canFilterByWarehouse && role !== "KHO_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (role === "KHO_MO" && !session?.user?.workplaceWarehouseId) {
    return NextResponse.json({ staff: [] });
  }

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get("weekStart");
  const parsed = weekParam ? parseISO(weekParam) : new Date();
  const weekStart = startOfWeek(isValid(parsed) ? parsed : new Date(), { weekStartsOn: 1 });

  const workplaceWarehouseId = canFilterByWarehouse
    ? searchParams.get("warehouseId")?.trim() || null
    : session!.user!.workplaceWarehouseId!;
  const staff = await getTaskCompletionReport(weekStart, workplaceWarehouseId);

  return NextResponse.json({ staff });
}
