import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { canExplainDefect } from "@/lib/order-feedback";
import { isDefectRating, ORDER_FEEDBACK_CAUSE_LABELS } from "@/lib/order-feedback-constants";
import { z } from "zod";

const schema = z.object({
  cause: z.enum(["FINISHED_WAREHOUSE", "PRODUCTION"], { message: "Chọn 1 nguyên nhân" }),
  explanation: z.string().trim().min(1, "Nhập nội dung giải trình lỗi").max(3000),
});

// QL Kho thành phẩm xác nhận nguyên nhân 1 đơn lỗi (phản hồi dưới 5 sao): đúng 1 trong 2 — Lỗi do Kho thành
// phẩm / Lỗi do phòng sản xuất — kèm nội dung giải trình. Xác nhận 1 lần (khoá theo cause chưa có), báo lại NV
// bán hàng của đơn + Admin kỹ thuật.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!canExplainDefect(session.user.role)) return NextResponse.json({ message: "Chỉ QL Kho thành phẩm được xác nhận nguyên nhân" }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { cause, explanation } = parsed.data;

  const feedback = await prisma.orderFeedback.findUnique({
    where: { id },
    select: { id: true, rating: true, order: { select: { code: true, saleId: true } } },
  });
  if (!feedback) return NextResponse.json({ message: "Không tìm thấy phản hồi" }, { status: 404 });
  if (!isDefectRating(feedback.rating)) return NextResponse.json({ message: "Phản hồi 5 sao không cần xác nhận nguyên nhân" }, { status: 400 });

  const locked = await prisma.orderFeedback.updateMany({
    where: { id, cause: null },
    data: { cause, causeExplanation: explanation, causeById: session.user.id, causeAt: new Date() },
  });
  if (locked.count !== 1) return NextResponse.json({ message: "Đơn này đã được xác nhận nguyên nhân — tải lại trang" }, { status: 400 });

  const adminsKt = await prisma.user.findMany({ where: { isActive: true, role: "ADMIN_KY_THUAT" }, select: { id: true } });
  const recipientIds = [...new Set([feedback.order.saleId, ...adminsKt.map((u) => u.id)])];
  await Promise.all(recipientIds.map((userId) => createAlert({
    type: "ORDER_FEEDBACK_EXPLAINED",
    title: `Đơn ${feedback.order.code}: ${ORDER_FEEDBACK_CAUSE_LABELS[cause]}`,
    message: `${session.user.name ?? "QL Kho thành phẩm"} đã xác nhận nguyên nhân: ${ORDER_FEEDBACK_CAUSE_LABELS[cause]}. Giải trình: ${explanation.length > 200 ? `${explanation.slice(0, 200)}…` : explanation}`,
    userId, relatedId: feedback.id, relatedType: "OrderFeedback",
  })));

  return NextResponse.json({ success: true, message: "Đã xác nhận nguyên nhân" });
}
