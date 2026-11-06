import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateInvoice, canViewAllInvoices, loadInvoiceContext } from "@/lib/invoice";
import { canSaleViewOrder } from "@/lib/customer-manager";
import { buildOrderInvoicePrefill } from "@/lib/order-pricing";

// Dữ liệu cho form lập invoice tính xem trước ở trình duyệt: thị trường + bảng giá + tỉ giá tháng + cài đặt.
// Có orderId (đơn đã tính giá): dùng thị trường + bảng giá đơn đã chốt, kèm sẵn dòng hàng của đơn (orderPrefill).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canCreateInvoice(session.user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  let marketId = req.nextUrl.searchParams.get("marketId") ?? "";
  const orderId = req.nextUrl.searchParams.get("orderId") ?? "";
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ message: "Ngày không hợp lệ" }, { status: 400 });
  let orderPriceListId: string | null | undefined;
  if (orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { saleId: true, pricedAt: true, priceListId: true, salesMarketId: true } });
    if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
    if (!canViewAllInvoices(session.user.role) && order.saleId !== session.user.id && !(await canSaleViewOrder(session.user.id, orderId))) {
      return NextResponse.json({ message: "Không có quyền với đơn hàng này" }, { status: 403 });
    }
    if (order.pricedAt && order.salesMarketId) {
      marketId = order.salesMarketId;
      orderPriceListId = order.priceListId;
    }
  }
  const ctx = await loadInvoiceContext(marketId, date, undefined, orderPriceListId);
  if (!ctx) return NextResponse.json({ message: "Không tìm thấy thị trường" }, { status: 404 });
  return NextResponse.json({ ...ctx, orderPrefill: orderPriceListId === undefined ? null : await buildOrderInvoicePrefill(orderId) });
}
