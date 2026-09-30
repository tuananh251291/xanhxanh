import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const patchSchema = z.object({
  action: z.enum(["accept", "disagree"]),
  // Ý kiến phản hồi của NV cấy mô — bắt buộc khi không đồng ý, gửi kèm trong thông báo cho NV Kỹ thuật
  // đã đánh giá + Admin kỹ thuật.
  feedback: z.string().trim().max(1000).optional(),
});

// Phản hồi của NV cấy mô với kết luận CAY_MO_SAI của NV Kỹ thuật (xem PATCH /api/alerts — tạo
// OutputDeviationResolution + gửi alert OUTPUT_DEVIATION_STAFF_RESPONSE_NEEDED có relatedId = id ở đây).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const feedback = parsed.data.feedback ?? "";
  if (parsed.data.action === "disagree" && !feedback) {
    return NextResponse.json({ message: "Vui lòng ghi ý kiến phản hồi khi không đồng ý" }, { status: 400 });
  }

  const resolution = await prisma.outputDeviationResolution.findUnique({
    where: { id },
    select: {
      id: true,
      cause: true,
      staffResponse: true,
      instructionId: true,
      resolvedById: true,
      resolvedBy: { select: { name: true, code: true } },
      errorTypes: { select: { errorType: { select: { label: true } } } },
    },
  });
  if (!resolution) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id: resolution.instructionId },
    select: { code: true, assignedToId: true, assignedTo: { select: { name: true, code: true } } },
  });
  if (!instruction || instruction.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (resolution.cause !== "CAY_MO_SAI") {
    return NextResponse.json({ message: "Đánh giá này không cần phản hồi" }, { status: 400 });
  }
  if (resolution.staffResponse !== null) {
    return NextResponse.json({ message: "Bạn đã phản hồi đánh giá này rồi" }, { status: 400 });
  }

  const staffResponse = parsed.data.action === "accept" ? "ACCEPTED" : "DISAGREED";
  await prisma.$transaction([
    prisma.outputDeviationResolution.update({
      where: { id },
      data: { staffResponse, staffRespondedAt: new Date(), staffFeedback: staffResponse === "DISAGREED" ? feedback : null },
    }),
    prisma.alert.updateMany({
      where: {
        type: "OUTPUT_DEVIATION_STAFF_RESPONSE_NEEDED",
        relatedId: id,
        relatedType: "OutputDeviationResolution",
        userId: session.user.id,
      },
      data: { status: "RESOLVED", readAt: new Date() },
    }),
  ]);

  if (parsed.data.action === "disagree") {
    // Kèm (các) lỗi cấy NV Kỹ thuật đã tích lúc kết luận CAY_MO_SAI — người nhận thấy ngay NV cấy mô đang
    // phản đối lỗi nào mà không phải tra lại báo cáo.
    const errorLabels = resolution.errorTypes.map((et) => et.errorType.label);
    const message = [
      `NV cấy mô ${instruction.assignedTo?.code} — ${instruction.assignedTo?.name} không đồng ý với đánh giá lỗi cấy cho chỉ định ${instruction.code}.`,
      `Lỗi cấy NV Kỹ thuật đánh giá: ${errorLabels.length ? errorLabels.join(", ") : "—"}`,
      `Ý kiến phản hồi: ${feedback}`,
    ].join("\n");
    // Admin kỹ thuật cần biết thêm NV Kỹ thuật nào đã đánh giá (NV Kỹ thuật đó thì tự biết rồi).
    const adminMessage = `${message}\nNV Kỹ thuật đánh giá: ${resolution.resolvedBy.code} — ${resolution.resolvedBy.name}`;
    await createAlert({
      type: "OUTPUT_DEVIATION_DISAGREED",
      title: "NV cấy mô không đồng ý với đánh giá lỗi cấy",
      message,
      userId: resolution.resolvedById,
      relatedId: resolution.id,
      relatedType: "OutputDeviationResolution",
    });
    const adminKyThuatUsers = await prisma.user.findMany({
      where: { role: "ADMIN_KY_THUAT", isActive: true },
      select: { id: true },
    });
    for (const admin of adminKyThuatUsers) {
      await createAlert({
        type: "OUTPUT_DEVIATION_DISAGREED",
        title: "NV cấy mô không đồng ý với đánh giá lỗi cấy",
        message: adminMessage,
        userId: admin.id,
        relatedId: resolution.id,
        relatedType: "OutputDeviationResolution",
      });
    }
  }

  return NextResponse.json({ success: true });
}
