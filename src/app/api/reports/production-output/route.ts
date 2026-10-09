import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { buildProductionOutputReport } from "@/lib/production-output-report";

// "Sản lượng ghi nhận" (HCNS) — ?month=yyyy-MM (kỳ lương), ?warehouseId=, ?q= (tìm NV/mã cây). Có đơn giá/
// thành tiền (dữ liệu lương) nên chỉ SUPER_ADMIN + NV Hành chính nhân sự, giống Bảng lương.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const report = await buildProductionOutputReport({ month: sp.get("month"), warehouseId: sp.get("warehouseId") || undefined, q: sp.get("q") });
  return NextResponse.json(report);
}
