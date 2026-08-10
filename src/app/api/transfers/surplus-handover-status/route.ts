import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurplusHandoverCandidatesForWarehouse } from "@/lib/surplus-handover";

// Danh sách NV cấy mô thuộc kho của Kho mô đang đăng nhập có chỉ định đã KẾT THÚC (hết tuần/tự kết thúc
// sớm) còn mẫu mẹ dư nhưng CHƯA bàn giao lên (surplusHandedOverAt null) — xem
// getSurplusHandoverCandidatesForWarehouse (src/lib/surplus-handover.ts).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const staffList = await getSurplusHandoverCandidatesForWarehouse(workplaceWarehouseId);
  return NextResponse.json({ staffList });
}
