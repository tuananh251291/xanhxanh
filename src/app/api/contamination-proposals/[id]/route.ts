import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { addToContaminationRoom } from "@/lib/contamination-room";
import { upsertLot } from "@/lib/goods-receipt";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const schema = z.union([
  z.object({ action: z.enum(["approve", "reject"]), reason: z.string().trim().max(500).optional() }),
  // "Sửa & gửi lại" — chỉ áp dụng cho đề xuất đã REJECTED, chỉ đổi được Số lượng/Loại/Ghi chú (mã cây,
  // quy cách, phòng nguồn GIỮ NGUYÊN như phiếu gốc — đổi những cái đó coi như 1 đề xuất khác hẳn, phải
  // gửi mới qua form thường). Xem canResubmitProposal (permission) + validate riêng cho type=TRONG bên dưới.
  z.object({
    resubmit: z.literal(true),
    type: z.enum(["TRONG", "HUY"]),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
  }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  if ("resubmit" in parsed.data) {
    if (!session?.user) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

    const proposal = await prisma.contaminationProposal.findUnique({
      where: { id },
      include: { plantType: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } } },
    });
    if (!proposal) return NextResponse.json({ message: "Không tìm thấy đề xuất" }, { status: 404 });
    if (proposal.status !== "REJECTED") {
      return NextResponse.json({ message: "Chỉ sửa & gửi lại được đề xuất đã bị từ chối" }, { status: 400 });
    }

    // Đúng NV đã gửi đề xuất này, HOẶC Quản lý kho thành phẩm của đúng kho đó (đề xuất do Kho thành
    // phẩm gửi — roomId khác null) — Kho mô không có vai trò "quản lý" tương đương nên chỉ đúng NV gốc.
    const isOwner = proposal.requestedById === session.user.id;
    const isFinishedGoodsManager =
      proposal.roomId != null && session.user.role === "QUAN_LY_KHO_THANH_PHAM" && session.user.workplaceWarehouseId === proposal.warehouseId;
    if (!isOwner && !isFinishedGoodsManager) {
      return NextResponse.json({ message: "Bạn không có quyền sửa & gửi lại đề xuất này" }, { status: 403 });
    }

    const { type, quantity, notes } = parsed.data;

    // Đổi sang Trồng cho đề xuất Kho thành phẩm CHƯA từng chọn Vườn sản xuất (tạo lúc type=HUY) — không
    // hỗ trợ chọn Vườn ở đây (giữ form sửa đơn giản, chỉ Số lượng/Loại/Ghi chú), phải gửi đề xuất mới qua
    // form thường nếu thực sự cần đổi hẳn sang Trồng.
    if (type === "TRONG" && proposal.roomId && !proposal.productionGardenId) {
      return NextResponse.json(
        { message: "Đề xuất này chưa có Vườn sản xuất — không đổi sang \"Trồng\" được ở đây, hãy gửi đề xuất mới" },
        { status: 400 }
      );
    }

    let lotId: string;
    if (proposal.roomId) {
      const lot = await prisma.lot.findFirst({ where: { roomId: proposal.roomId, plantTypeId: proposal.plantTypeId, stageCode: proposal.stageCode, status: "ACTIVE" } });
      if (!lot || lot.quantity < quantity) {
        return NextResponse.json({ message: `Phòng không có đủ số lượng cho mã cây/quy cách này (còn ${lot?.quantity ?? 0})` }, { status: 400 });
      }
      lotId = lot.id;
    } else {
      const room = await prisma.room.findFirst({ where: { warehouseId: proposal.warehouseId, type: "PHONG_NHIEM" } });
      const lot = room ? await prisma.lot.findFirst({ where: { roomId: room.id, plantTypeId: proposal.plantTypeId, stageCode: proposal.stageCode, status: "ACTIVE" } }) : null;
      if (!lot || lot.quantity < quantity) {
        return NextResponse.json({ message: `Phòng nhiễm không có đủ số lượng cho mã cây/quy cách này (còn ${lot?.quantity ?? 0})` }, { status: 400 });
      }
      lotId = lot.id;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.lot.update({ where: { id: lotId }, data: { quantity: { decrement: quantity } } });
      return tx.contaminationProposal.update({
        where: { id },
        data: {
          type, quantity, notes,
          status: "PENDING",
          approvedById: null,
          approvedAt: null,
          rejectionReason: null,
        },
      });
    });

    const typeLabel = type === "TRONG" ? "Trồng lại" : "Hủy bỏ";
    for (const targetRole of ["ADMIN", "SUPER_ADMIN"] as const) {
      await createAlert({
        type: "CONTAMINATION_PROPOSAL",
        title: "Đề xuất Trồng/Hủy đã được sửa & gửi lại",
        message: `${session.user.name} đã sửa & gửi lại đề xuất "${typeLabel}" ${quantity.toLocaleString("vi-VN")} ${proposal.plantType.name} (${proposal.stageCode}) — phiếu ${proposal.code}`,
        targetRole,
        relatedId: proposal.id,
        relatedType: "ContaminationProposal",
      });
    }

    return NextResponse.json(updated);
  }

  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Chỉ Admin mới có quyền duyệt đề xuất" }, { status: 403 });
  }

  const proposal = await prisma.contaminationProposal.findUnique({
    where: { id },
    include: { plantType: { select: { code: true, name: true } }, warehouse: { select: { code: true } }, requestedBy: { select: { code: true } } },
  });
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.status !== "PENDING") return NextResponse.json({ message: "Đề xuất đã được xử lý" }, { status: 400 });

  const { action, reason } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.contaminationProposal.update({
      where: { id },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        approvedById: session!.user!.id,
        approvedAt: new Date(),
        rejectionReason: action === "reject" ? reason || null : null,
      },
    });

    // Từ chối — hoàn lại số lượng vì lúc gửi đề xuất đã trừ ngay.
    if (action === "reject") {
      if (proposal.roomId) {
        // Đề xuất từ Kho thành phẩm — hoàn lại đúng phòng đã trừ (không phải Phòng nhiễm).
        await upsertLot(tx, proposal.roomId, proposal.plantTypeId, proposal.plantType.code, proposal.stageCode, proposal.quantity, proposal.requestedBy.code);
      } else {
        const stage = proposal.stageCode.startsWith("T") ? "THANH_PHAM" : "MAU_ME";
        await addToContaminationRoom(tx, {
          warehouseId: proposal.warehouseId,
          warehouseCode: proposal.warehouse.code,
          plantTypeId: proposal.plantTypeId,
          plantTypeCode: proposal.plantType.code,
          stage,
          stageCode: proposal.stageCode,
          quantity: proposal.quantity,
          reportedById: session!.user!.id,
          staffBalanceOwnerId: null,
          reason: "PROPOSAL_REJECTED_REFUND",
          sourceLotCode: proposal.code,
        });
      }
    }
  });

  if (action === "reject") {
    const typeLabel = proposal.type === "TRONG" ? "Trồng lại" : "Hủy bỏ";
    await createAlert({
      type: "CONTAMINATION_PROPOSAL_REJECTED",
      title: "Đề xuất Trồng/Hủy bị từ chối",
      message: `Đề xuất "${typeLabel}" ${proposal.quantity.toLocaleString("vi-VN")} ${proposal.plantType.name} (${proposal.stageCode}) — phiếu ${proposal.code} đã bị từ chối${reason ? `: ${reason}` : ""}. Vào "Đề xuất Trồng/Hủy" để sửa & gửi lại nếu cần.`,
      userId: proposal.requestedById,
      relatedId: proposal.id,
      relatedType: "ContaminationProposal",
    });
  }

  return NextResponse.json({ success: true });
}
