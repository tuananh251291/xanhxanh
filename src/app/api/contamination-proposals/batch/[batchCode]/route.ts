import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const include = {
  plantType: { select: { code: true, name: true } },
  warehouse: { select: { code: true, name: true } },
  room: { select: { name: true } },
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
  if (role === "KHO_MO" || isKhoThanhPhamRole(role)) {
    if (!session.user.workplaceWarehouseId) return NextResponse.json([]);
    where.warehouseId = session.user.workplaceWarehouseId;
  } else if (!isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const proposals = await prisma.contaminationProposal.findMany({ where, include, orderBy: { createdAt: "asc" } });
  return NextResponse.json(proposals);
}

const patchSchema = z.object({ action: z.literal("approve") });

// "Duyệt nhanh tất cả" — duyệt 1 lượt mọi dòng đang PENDING trong đề xuất, khỏi phải bấm Duyệt từng
// dòng cây. Chỉ hỗ trợ approve (updateMany an toàn vì approve không có tác dụng phụ tồn kho — xem PATCH
// /api/contamination-proposals/[id]); Từ chối vẫn phải làm từng dòng vì mỗi dòng hoàn tồn về 1 nguồn
// khác nhau, Admin nên xem lý do trước khi từ chối riêng lẻ.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ batchCode: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Chỉ Admin mới có quyền duyệt đề xuất" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { batchCode } = await params;
  const pending = await prisma.contaminationProposal.findMany({
    where: { ...batchWhere(batchCode), status: "PENDING" },
    select: { id: true },
  });
  if (pending.length === 0) return NextResponse.json({ message: "Không có dòng nào đang chờ duyệt" }, { status: 400 });

  await prisma.contaminationProposal.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { status: "APPROVED", approvedById: session!.user!.id, approvedAt: new Date() },
  });

  return NextResponse.json({ success: true, count: pending.length });
}
