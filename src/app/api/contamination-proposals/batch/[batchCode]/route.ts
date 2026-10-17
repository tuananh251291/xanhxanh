import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requiresSuperAdminApproval, attachApprovedToGardenHandover, notifyGardenHandoversCreated } from "@/lib/garden-handover";
import { moveApprovedMarketPlantingToPlantRoom, isMarketSaleApprover, findMarketPlantingMissingPot, missingPotMessage } from "@/lib/market-inspection";

const include = {
  plantType: { select: { code: true, name: true } },
  warehouse: { select: { code: true, name: true } },
  room: { select: { name: true, type: true } },
  requestedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  productionGarden: { select: { code: true, name: true } },
} as const;

// batchCode = null với các dòng tạo trước khi có tính năng gộp — hiển thị/đường dẫn dùng chính `code`
// của dòng đó làm "mã đề xuất" (xem groupIntoBatches ở contamination-proposal-board.tsx).
function batchWhere(batchCode: string): Prisma.ContaminationProposalWhereInput {
  return { OR: [{ batchCode }, { batchCode: null, code: batchCode }] };
}

// Trang chi tiết 1 "đề xuất" (Xem thêm) — tách riêng khỏi GET /api/contamination-proposals vì phiếu gộp
// có thể tới vài chục loại cây, không muốn tải/hiện hết trong popup nhỏ (xem [batchCode]/page.tsx).
export async function GET(req: NextRequest, { params }: { params: Promise<{ batchCode: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { batchCode } = await params;

  const where: Prisma.ContaminationProposalWhereInput = batchWhere(batchCode);
  if (role === "KHO_MO" || isKhoThanhPhamRole(role) || role === "DOI_TAC_VAN_HANH") {
    if (!session.user.workplaceWarehouseId) return NextResponse.json([]);
    where.warehouseId = session.user.workplaceWarehouseId;
  } else if (role === "SALE") {
    const access = await prisma.retailWarehouseAccess.findMany({
      where: { userId: session.user.id },
      select: { warehouseId: true },
    });
    if (access.length === 0) return NextResponse.json([]);
    where.warehouseId = { in: access.map((a) => a.warehouseId) };
  } else if (!isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const proposals = await prisma.contaminationProposal.findMany({ where, include, orderBy: { createdAt: "asc" } });
  return NextResponse.json(proposals);
}

const patchSchema = z.object({ action: z.literal("approve") });

// "Duyệt nhanh tất cả" — duyệt 1 lượt mọi dòng đang PENDING trong đề xuất, khỏi phải bấm Duyệt từng
// dòng cây. Chỉ hỗ trợ approve (tác dụng phụ tồn kho duy nhất của approve: Trồng của Đối tác vận hành từ
// Phòng SP đạt/không đạt cộng vào Phòng cây trồng — moveApprovedMarketPlantingToPlantRoom, giống PATCH
// /api/contamination-proposals/[id]); Từ chối vẫn phải làm từng dòng vì mỗi dòng hoàn tồn về 1 nguồn
// khác nhau, Admin nên xem lý do trước khi từ chối riêng lẻ.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ batchCode: string }> }) {
  const session = await auth();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { batchCode } = await params;
  const pending = await prisma.contaminationProposal.findMany({
    where: { ...batchWhere(batchCode), status: "PENDING" },
    select: { id: true, warehouseId: true, room: { select: { type: true } }, warehouse: { select: { type: true } } },
  });
  if (pending.length === 0) return NextResponse.json({ message: "Không có dòng nào đang chờ duyệt" }, { status: 400 });

  // Cả batch cùng 1 kho (1 người gửi 1 lần) — chỉ cần tra quyền theo kho của dòng đầu, giống hệt
  // permission ở PATCH /api/contamination-proposals/[id] (Kho thị trường: chỉ QL thị trường; còn lại: Admin).
  const canApprove = pending[0].warehouse.type === "THI_TRUONG"
    ? await isMarketSaleApprover(session?.user?.id ?? "", session?.user?.role, pending[0].warehouseId)
    : isAdminRole(session?.user?.role);
  if (!canApprove) {
    return NextResponse.json({ message: "Bạn không có quyền duyệt đề xuất này" }, { status: 403 });
  }

  if (pending.some((p) => requiresSuperAdminApproval(p.room)) && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Đề xuất từ Phòng chờ xử lý chỉ Admin cấp cao được duyệt" }, { status: 403 });
  }

  const missingPot = await findMarketPlantingMissingPot(pending.map((p) => p.id));
  if (missingPot) return NextResponse.json({ message: missingPotMessage(missingPot) }, { status: 400 });

  const newHandoverIds = await prisma.$transaction(async (tx) => {
    await tx.contaminationProposal.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: "APPROVED", approvedById: session!.user!.id, approvedAt: new Date() },
    });
    await moveApprovedMarketPlantingToPlantRoom(tx, pending.map((p) => p.id));
    return attachApprovedToGardenHandover(tx, pending.map((p) => p.id));
  });
  await notifyGardenHandoversCreated(newHandoverIds);

  return NextResponse.json({ success: true, count: pending.length });
}
