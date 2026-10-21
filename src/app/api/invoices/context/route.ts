import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreateInvoice, loadInvoiceContext } from "@/lib/invoice";

// Dữ liệu cho form lập invoice tính xem trước ở trình duyệt: thị trường + bảng giá + tỉ giá tháng + cài đặt.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canCreateInvoice(session.user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const marketId = req.nextUrl.searchParams.get("marketId") ?? "";
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ message: "Ngày không hợp lệ" }, { status: 400 });
  const ctx = await loadInvoiceContext(marketId, date);
  if (!ctx) return NextResponse.json({ message: "Không tìm thấy thị trường" }, { status: 404 });
  return NextResponse.json(ctx);
}
