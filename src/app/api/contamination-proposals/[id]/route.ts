import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { addToContaminationRoom } from "@/lib/contamination-room";
import { z } from "zod";

const schema = z.object({ action: z.enum(["approve", "reject"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Chỉ Admin mới có quyền duyệt đề xuất" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const proposal = await prisma.contaminationProposal.findUnique({
    where: { id },
    include: { plantType: { select: { code: true } }, warehouse: { select: { code: true } } },
  });
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.status !== "PENDING") return NextResponse.json({ message: "Đề xuất đã được xử lý" }, { status: 400 });

  const { action } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.contaminationProposal.update({
      where: { id },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        approvedById: session!.user!.id,
        approvedAt: new Date(),
      },
    });

    // Từ chối — hoàn lại số lượng về Phòng nhiễm vì lúc gửi đề xuất đã trừ ngay.
    if (action === "reject") {
      const stage = proposal.stageCode.startsWith("T") ? "THANH_PHAM" : "MAU_ME";
      await addToContaminationRoom(tx, {
        warehouseId: proposal.warehouseId,
        warehouseCode: proposal.warehouse.code,
        plantTypeId: proposal.plantTypeId,
        plantTypeCode: proposal.plantType.code,
        stage,
        stageCode: proposal.stageCode,
        quantity: proposal.quantity,
      });
    }
  });

  return NextResponse.json({ success: true });
}
