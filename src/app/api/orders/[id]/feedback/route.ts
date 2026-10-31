import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { uploadOrderFeedbackPhotos } from "@/lib/order-feedback";
import { isDefectRating, MAX_ORDER_FEEDBACK_PHOTOS, MAX_ORDER_FEEDBACK_PHOTO_DATA_URL_LENGTH } from "@/lib/order-feedback-constants";
import { z } from "zod";

const schema = z.object({
  rating: z.number().int().min(1, "Chọn số sao từ 1 đến 5").max(5),
  content: z.string().trim().max(3000).optional(),
  videoUrl: z.string().trim().max(1000).url("Link video không hợp lệ").refine((u) => /^https?:\/\//i.test(u), "Link video phải bắt đầu bằng http(s)://").optional(),
  photos: z.array(z.string().max(MAX_ORDER_FEEDBACK_PHOTO_DATA_URL_LENGTH, "Ảnh quá lớn")).max(MAX_ORDER_FEEDBACK_PHOTOS, `Tối đa ${MAX_ORDER_FEEDBACK_PHOTOS} ảnh`).default([]),
});

// NV bán hàng của đơn ghi nhận phản hồi đánh giá chất lượng của khách cho đơn ĐÃ XUẤT KHO — 1 đơn 1 phản hồi.
// Dưới 5 sao = đơn hàng có lỗi: báo Admin kỹ thuật + QL Kho thành phẩm (QL Kho TP xác nhận nguyên nhân ở
// /defect-orders, xem PATCH /api/order-feedbacks/[id]).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { rating, content, videoUrl, photos } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, code: true, customerCode: true, status: true, saleId: true, sale: { select: { name: true } }, feedback: { select: { id: true } } },
  });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (order.saleId !== session.user.id) return NextResponse.json({ message: "Chỉ NV bán hàng của đơn được ghi nhận phản hồi" }, { status: 403 });
  if (order.status !== "SHIPPED") return NextResponse.json({ message: "Chỉ ghi nhận phản hồi cho đơn đã xuất kho" }, { status: 400 });
  if (order.feedback) return NextResponse.json({ message: "Đơn này đã có phản hồi" }, { status: 400 });

  let photoUrls: string[];
  try {
    photoUrls = await uploadOrderFeedbackPhotos(photos, order.code);
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "Tải ảnh lên thất bại" }, { status: 500 });
  }

  let feedbackId: string;
  try {
    feedbackId = (await prisma.orderFeedback.create({
      data: { orderId: order.id, rating, content: content || null, videoUrl: videoUrl || null, photoUrls, createdById: session.user.id },
      select: { id: true },
    })).id;
  } catch (err) {
    // Gửi trùng 2 lần cùng lúc — orderId unique chặn bản thứ 2.
    if ((err as { code?: string }).code === "P2002") return NextResponse.json({ message: "Đơn này đã có phản hồi" }, { status: 400 });
    throw err;
  }

  if (isDefectRating(rating)) {
    const recipients = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN_KY_THUAT", "QUAN_LY_KHO_THANH_PHAM"] } },
      select: { id: true },
    });
    const summary = content ? ` — "${content.length > 160 ? `${content.slice(0, 160)}…` : content}"` : "";
    await Promise.all(recipients.map((r) => createAlert({
      type: "ORDER_FEEDBACK_DEFECT",
      title: `Đơn ${order.code} bị khách đánh giá ${rating} sao`,
      message: `Khách ${order.customerCode} (NV bán hàng ${order.sale.name}) đánh giá ${rating}/5 sao${summary}. QL Kho thành phẩm xác nhận nguyên nhân lỗi.`,
      userId: r.id, relatedId: feedbackId, relatedType: "OrderFeedback",
    })));
  }

  return NextResponse.json({ success: true, message: isDefectRating(rating) ? "Đã gửi phản hồi — đã báo Admin kỹ thuật và QL Kho thành phẩm" : "Đã ghi nhận phản hồi" });
}
