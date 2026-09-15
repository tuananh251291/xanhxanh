import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { applyForecastEntry } from "@/lib/mother-forecast";
import { z } from "zod";

function canReviewMotherForecast(role: string | null | undefined) {
  return role === "ADMIN_KY_THUAT" || role === "SUPER_ADMIN";
}

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

// Admin kỹ thuật/Admin cấp cao duyệt/từ chối 1 đề xuất chỉnh sửa "Dự kiến đáp ứng mẫu mẹ" — duyệt thì mới
// thực sự upsert vào MotherForecastEntry (qua applyForecastEntry), gửi lúc tạo đề xuất KHÔNG tự đổi dữ
// liệu chính. Mirror PATCH /api/rooting-forecast-edit-proposals/[id], khác quyền duyệt (xem
// canReviewMotherForecast).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canReviewMotherForecast(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { action, reason } = parsed.data;

  const proposal = await prisma.motherForecastEditProposal.findUnique({
    where: { id },
    include: { items: true, warehouse: { select: { name: true } } },
  });
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.status !== "PENDING") {
    return NextResponse.json({ message: "Đề xuất này đã được xử lý" }, { status: 400 });
  }

  if (action === "approve") {
    await prisma.$transaction(async (tx) => {
      for (const item of proposal.items) {
        await applyForecastEntry(tx, {
          warehouseId: proposal.warehouseId, plantTypeId: item.plantTypeId, taskMonth: proposal.taskMonth,
          assignedStaffId: item.assignedStaffId,
          quantity1: item.quantity1, quantity2: item.quantity2, quantity3: item.quantity3,
          enteredById: proposal.requestedById,
        });
      }
      await tx.motherForecastEditProposal.update({
        where: { id },
        data: { status: "APPROVED", reviewedById: session!.user!.id, reviewedAt: new Date() },
      });
    });
    await createAlert({
      type: "MOTHER_FORECAST_EDIT_APPROVED",
      title: "Đề xuất chỉnh sửa đã được duyệt",
      message: `Đề xuất chỉnh sửa "Dự kiến đáp ứng mẫu mẹ" của ${proposal.warehouse.name} đã được duyệt — dữ liệu đã cập nhật.`,
      userId: proposal.requestedById,
      relatedId: proposal.id,
      relatedType: "MotherForecastEditProposal",
    });
  } else {
    await prisma.motherForecastEditProposal.update({
      where: { id },
      data: { status: "REJECTED", reviewedById: session!.user!.id, reviewedAt: new Date(), rejectionReason: reason || null },
    });
    await createAlert({
      type: "MOTHER_FORECAST_EDIT_REJECTED",
      title: "Đề xuất chỉnh sửa bị từ chối",
      message: `Đề xuất chỉnh sửa "Dự kiến đáp ứng mẫu mẹ" của ${proposal.warehouse.name} đã bị từ chối${reason ? `: ${reason}` : ""}.`,
      userId: proposal.requestedById,
      relatedId: proposal.id,
      relatedType: "MotherForecastEditProposal",
    });
  }

  const updated = await prisma.motherForecastEditProposal.findUnique({
    where: { id },
    select: {
      id: true, status: true, rejectionReason: true,
      warehouse: { select: { code: true, name: true } },
      requestedBy: { select: { code: true, name: true } },
    },
  });
  return NextResponse.json(updated);
}
