import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getTaskCompletionReport } from "@/lib/task-completion-report";
import { startOfWeek, isValid, parseISO } from "date-fns";

// Báo cáo "Số ngày không hoàn thành nhiệm vụ" — Admin xem toàn bộ, Kho mô chỉ xem đúng NV cùng kho sản
// xuất mình làm việc (riêng NV kỹ thuật luôn hiện đủ vì không gán theo kho — xem task-completion-report.ts).
// NV Hành chính nhân sự (chỉ xem) xem toàn bộ như Admin — không gán theo kho sản xuất.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  const isHr = role === "HANH_CHINH_NHAN_SU";
  if (!isAdminRole(role) && role !== "KHO_MO" && !isHr) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (role === "KHO_MO" && !session?.user?.workplaceWarehouseId) {
    return NextResponse.json({ staff: [] });
  }

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get("weekStart");
  const parsed = weekParam ? parseISO(weekParam) : new Date();
  const weekStart = startOfWeek(isValid(parsed) ? parsed : new Date(), { weekStartsOn: 1 });

  const workplaceWarehouseId = isAdminRole(role) || isHr ? null : session!.user!.workplaceWarehouseId!;
  const staff = await getTaskCompletionReport(weekStart, workplaceWarehouseId);

  return NextResponse.json({ staff });
}
