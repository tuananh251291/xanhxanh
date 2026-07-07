import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { generateContaminationProposalCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const createSchema = z.object({
  type: z.enum(["TRONG", "HUY"]),
  plantTypeId: z.string(),
  stageCode: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
  // Mã đề xuất gộp — client truyền lại code của dòng đầu tiên trong cùng 1 lần bấm "Gửi đề xuất" (nhiều
  // dòng cây) để nhóm chung 1 "đề xuất" khi hiển thị. Bỏ trống với dòng đầu tiên của mỗi lần gửi.
  batchCode: z.string().optional(),
});

const include = {
  plantType: { select: { code: true, name: true } },
  warehouse: { select: { code: true, name: true } },
  requestedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
} as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  // Kho mô chỉ thấy đề xuất của đúng kho sản xuất mình đang làm việc — Admin thấy tất cả để duyệt.
  if (role === "KHO_MO") {
    if (!session.user.workplaceWarehouseId) return NextResponse.json([]);
    where.warehouseId = session.user.workplaceWarehouseId;
  } else if (!isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const proposals = await prisma.contaminationProposal.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(proposals);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") {
    return NextResponse.json({ message: "Chỉ NV kho mô mới có quyền gửi đề xuất" }, { status: 403 });
  }
  if (!session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc — không thể gửi đề xuất" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { type, plantTypeId, stageCode, quantity, notes, batchCode: requestedBatchCode } = parsed.data;
  const warehouseId = session.user.workplaceWarehouseId;

  const room = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_NHIEM" } });
  const lot = room
    ? await prisma.lot.findFirst({ where: { roomId: room.id, plantTypeId, stageCode, status: "ACTIVE" } })
    : null;
  if (!lot || lot.quantity < quantity) {
    return NextResponse.json(
      { message: `Phòng nhiễm không có đủ số lượng cho mã cây/quy cách này (còn ${lot?.quantity ?? 0})` },
      { status: 400 }
    );
  }

  const code = await generateContaminationProposalCode(type);

  // Chỉ nhận batchCode do client truyền lại nếu đúng là code của 1 dòng đã tạo trước đó, cùng người gửi,
  // cùng kho, cùng loại Trồng/Hủy — tránh gộp nhầm đề xuất không liên quan nếu client gửi sai dữ liệu.
  let batchCode = code;
  if (requestedBatchCode) {
    const head = await prisma.contaminationProposal.findFirst({
      where: { code: requestedBatchCode, requestedById: session.user.id, warehouseId, type },
    });
    if (head) batchCode = head.batchCode ?? head.code;
  }

  const proposal = await prisma.$transaction(async (tx) => {
    await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: quantity } } });
    return tx.contaminationProposal.create({
      data: {
        code,
        batchCode,
        type,
        warehouseId,
        plantTypeId,
        stageCode,
        quantity,
        notes,
        requestedById: session.user.id,
      },
      include,
    });
  });

  const typeLabel = type === "TRONG" ? "Trồng lại" : "Hủy bỏ";
  for (const targetRole of ["ADMIN", "SUPER_ADMIN"] as const) {
    await createAlert({
      type: "CONTAMINATION_PROPOSAL",
      title: "Có đề xuất Trồng/Hủy hàng nhiễm mới",
      message: `${session.user.name} đề xuất "${typeLabel}" ${quantity.toLocaleString("vi-VN")} ${proposal.plantType.name} (${stageCode}) — phiếu ${code}`,
      targetRole,
      relatedId: proposal.id,
      relatedType: "ContaminationProposal",
    });
  }

  return NextResponse.json(proposal, { status: 201 });
}
