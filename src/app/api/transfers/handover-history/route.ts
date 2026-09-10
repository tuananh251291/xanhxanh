import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeHandoverHistory } from "@/lib/handover-history";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "SUPER_ADMIN" && role !== "KHO_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  // Kho mô chỉ xem được đúng khu sản xuất mình đang làm việc.
  if (role === "KHO_MO" && !session?.user?.workplaceWarehouseId) {
    return NextResponse.json({ rows: [] });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const staffId = searchParams.get("staffId") || undefined;
  const warehouseId = role === "KHO_MO" ? session!.user.workplaceWarehouseId! : searchParams.get("warehouseId") || undefined;

  const rows = await computeHandoverHistory({ date, staffId, warehouseId });
  return NextResponse.json({ rows });
}
