import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { canExplainDefect, canViewAllDefectOrders, defectOrderScopeFor } from "@/lib/order-feedback";
import DefectOrdersBoard from "./defect-orders-board";

// Đơn hàng có lỗi — đơn đã xuất bị khách đánh giá dưới 5 sao (OrderFeedback.rating < 5). QL Kho thành phẩm,
// Admin kỹ thuật, Admin cấp cao xem mọi đơn; NV bán hàng xem đơn của mình (+ của NV mình quản lý nếu là người
// quản lý, xem defectOrderScopeFor). Chỉ QL Kho thành phẩm xác nhận nguyên nhân; ?feedback={id} mở thẳng chi tiết.
export default async function DefectOrdersPage({ searchParams }: { searchParams: Promise<{ feedback?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(await isPageAllowed(role, "/defect-orders"))) redirect("/dashboard");
  const scope = await defectOrderScopeFor(session.user);
  if (!scope) redirect("/dashboard");
  const sp = await searchParams;

  const rows = await prisma.orderFeedback.findMany({
    where: { rating: { lt: 5 }, order: scope },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true, rating: true, content: true, videoUrl: true, photoUrls: true, createdAt: true,
      cause: true, causeExplanation: true, causeAt: true,
      createdBy: { select: { name: true } }, causeBy: { select: { name: true } },
      order: {
        select: {
          id: true, code: true, customerCode: true, shippedAt: true, saleId: true,
          sale: { select: { code: true, name: true } }, marketWarehouse: { select: { name: true } },
          items: { select: { quantity: true, neededQuantity: true } },
        },
      },
    },
  });

  return (
    <DefectOrdersBoard
      canExplain={canExplainDefect(role)}
      showTeam={!canViewAllDefectOrders(role)}
      currentUserId={session.user.id}
      initialOpenId={sp.feedback && rows.some((r) => r.id === sp.feedback) ? sp.feedback : null}
      rows={rows.map((r) => ({
        orderId: r.order.id, orderCode: r.order.code,
        customer: r.order.marketWarehouse?.name ?? r.order.customerCode,
        saleId: r.order.saleId, saleName: `${r.order.sale.name} (${r.order.sale.code})`,
        shippedAt: r.order.shippedAt?.toISOString() ?? null,
        quantity: r.order.items.reduce((s, i) => s + (i.neededQuantity ?? i.quantity), 0),
        feedback: {
          id: r.id, rating: r.rating, content: r.content, videoUrl: r.videoUrl, photoUrls: r.photoUrls,
          createdAt: r.createdAt.toISOString(), createdByName: r.createdBy.name,
          cause: r.cause, causeExplanation: r.causeExplanation, causeAt: r.causeAt?.toISOString() ?? null, causeByName: r.causeBy?.name ?? null,
        },
      }))}
    />
  );
}
