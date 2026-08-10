import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isMediumOrderInProgress, isMediumSurplusEntryDay } from "@/lib/medium-orders";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const order = await prisma.mediumOrder.findUnique({
    where: { id },
    include: {
      instructions: { select: { code: true, plantType: { select: { name: true } } } },
      items: { include: { mediumType: { select: { code: true, name: true } } } },
      days: { orderBy: { date: "asc" } },
    },
  });
  if (!order) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  // Đơn chỉ thật sự "gửi" cho NV môi trường từ 00:00 Thứ 7 (xem ensureMediumOrdersSent) — chặn xem chi
  // tiết trước lúc đó, khớp với việc đã ẩn khỏi danh sách ở GET /api/medium-orders.
  if (session.user.role === "MOI_TRUONG" && !order.sentAt) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json(order);
}

const confirmSchema = z.object({ action: z.literal("confirm") });
// Kho mô nhập số túi môi trường dư còn lại từ tuần trước (đếm thực tế trên kệ) — trừ vào đúng dòng
// (stageCode + mediumType) của đơn đang thực hiện, chỉ cho phép đúng Thứ 2/Thứ 3 (chặn cứng theo yêu
// cầu nghiệp vụ, xem isMediumSurplusEntryDay), và chỉ khi CHƯA bấm "Hoàn thành" (surplusRecordedAt null).
const recordSurplusSchema = z.object({
  action: z.literal("recordSurplus"),
  itemId: z.string().min(1),
  surplusQuantity: z.number().int().min(0),
});
// Kho mô bấm "Hoàn thành nhập môi trường dư" sau khi đã nhập xong các dòng cần — đánh dấu
// surplusRecordedAt, khoá không sửa surplusQuantity được nữa và làm việc này biến mất khỏi danh sách
// công việc cần làm (xem getKhoMoDailyStats).
const finishSurplusEntrySchema = z.object({ action: z.literal("finishSurplusEntry") });
const patchSchema = z.discriminatedUnion("action", [confirmSchema, recordSurplusSchema, finishSurplusEntrySchema]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { id } = await params;

  if (parsed.data.action === "recordSurplus" || parsed.data.action === "finishSurplusEntry") {
    if (session.user.role !== "KHO_MO") {
      return NextResponse.json({ message: "Chỉ Kho mô mới nhập được môi trường dư" }, { status: 403 });
    }
    if (!isMediumSurplusEntryDay()) {
      return NextResponse.json({ message: "Chỉ nhập được môi trường dư vào Thứ 2 hoặc Thứ 3" }, { status: 400 });
    }
    const order = await prisma.mediumOrder.findUnique({
      where: { id },
      include: { items: true, days: { select: { handedOverAt: true, confirmedAt: true } } },
    });
    if (!order) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    // "Đơn hiện tại NV môi trường đang làm" = đã xác nhận nhưng chưa kết thúc (isMediumOrderInProgress) —
    // đơn chưa xác nhận thì chưa có gì để trừ dư, đơn đã kết thúc thì đã qua tuần đó rồi.
    if (!isMediumOrderInProgress(order)) {
      return NextResponse.json({ message: "Chỉ nhập được môi trường dư cho đơn đang thực hiện" }, { status: 400 });
    }
    if (order.surplusRecordedAt) {
      return NextResponse.json({ message: "Đã hoàn thành nhập môi trường dư tuần này" }, { status: 400 });
    }

    if (parsed.data.action === "finishSurplusEntry") {
      const updated = await prisma.mediumOrder.update({ where: { id }, data: { surplusRecordedAt: new Date() } });
      return NextResponse.json(updated);
    }

    const { itemId, surplusQuantity } = parsed.data;
    const item = order.items.find((i) => i.id === itemId);
    if (!item) return NextResponse.json({ message: "Không tìm thấy dòng này trong đơn" }, { status: 404 });

    const updated = await prisma.mediumOrderItem.update({
      where: { id: item.id },
      data: { surplusQuantity },
    });
    return NextResponse.json(updated);
  }

  // action === "confirm"
  if (session.user.role !== "MOI_TRUONG") {
    return NextResponse.json({ message: "Chỉ NV môi trường mới xác nhận được đơn" }, { status: 403 });
  }
  const order = await prisma.mediumOrder.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  // Mỗi NV môi trường chỉ được xử lý 1 đơn "đang thực hiện" tại 1 thời điểm — chặn xác nhận đơn mới nếu
  // đơn khác do chính người này xác nhận trước đó chưa kết thúc (xem isMediumOrderInProgress).
  if (!order.confirmedAt) {
    const myOrders = await prisma.mediumOrder.findMany({
      where: { confirmedById: session.user.id, confirmedAt: { not: null } },
      include: { days: { select: { handedOverAt: true, confirmedAt: true } } },
    });
    if (myOrders.some((o) => isMediumOrderInProgress(o))) {
      return NextResponse.json({ message: "Bạn cần hoàn thành đơn sản xuất hiện tại" }, { status: 400 });
    }
  }

  const updated = await prisma.mediumOrder.update({
    where: { id },
    data: { confirmedAt: order.confirmedAt ?? new Date(), confirmedById: order.confirmedById ?? session.user.id },
  });
  return NextResponse.json(updated);
}
