import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateReplantHandoverCode } from "@/lib/codes";

const include = {
  plantType: { select: { code: true, name: true } },
} as const;

// "Bàn giao cây trồng" — danh sách phiếu của đúng kho Kho mô/Nhân viên sản xuất đang làm việc, kèm danh
// sách đề xuất Trồng lại (type TRONG) đã được Admin duyệt nhưng CHƯA gộp vào phiếu nào (eligible, chỉ
// Kho mô thấy — để bấm "Bàn giao").
export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KHO_MO" && role !== "NHAN_VIEN_SAN_XUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const warehouseId = session!.user!.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ handovers: [], eligible: [] });

  const [handovers, eligible] = await Promise.all([
    prisma.replantHandover.findMany({
      where: { warehouseId },
      include: {
        createdBy: { select: { name: true } },
        confirmedBy: { select: { name: true } },
        proposals: { include },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    role === "KHO_MO"
      ? prisma.contaminationProposal.findMany({
          where: { warehouseId, type: "TRONG", status: "APPROVED", replantHandoverId: null },
          include,
          orderBy: { approvedAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    handovers: handovers.map((h) => ({
      id: h.id,
      code: h.code,
      status: h.status,
      createdByName: h.createdBy.name,
      createdAt: h.createdAt,
      confirmedByName: h.confirmedBy?.name ?? null,
      confirmedAt: h.confirmedAt,
      items: h.proposals.map((p) => ({
        id: p.id, plantTypeCode: p.plantType.code, plantTypeName: p.plantType.name, stageCode: p.stageCode, quantity: p.quantity,
      })),
    })),
    eligible: eligible.map((p) => ({
      id: p.id, plantTypeCode: p.plantType.code, plantTypeName: p.plantType.name, stageCode: p.stageCode, quantity: p.quantity,
    })),
  });
}

// "Bàn giao" — Kho mô gộp TẤT CẢ đề xuất Trồng lại đã duyệt, chưa bàn giao của kho mình thành 1 phiếu
// (status PENDING), gửi Nhân viên sản xuất cùng kho xác nhận (xem PATCH /api/replant-handovers/[id]).
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Chỉ NV kho mô mới có quyền" }, { status: 403 });
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 403 });

  const eligible = await prisma.contaminationProposal.findMany({
    where: { warehouseId, type: "TRONG", status: "APPROVED", replantHandoverId: null },
    select: { id: true },
  });
  if (eligible.length === 0) {
    return NextResponse.json({ message: "Chưa có đề xuất Trồng lại nào đã duyệt để bàn giao" }, { status: 400 });
  }

  const code = await generateReplantHandoverCode();
  const handover = await prisma.replantHandover.create({
    data: {
      code, warehouseId, createdById: session.user.id,
      proposals: { connect: eligible.map((p) => ({ id: p.id })) },
    },
  });

  return NextResponse.json({ success: true, id: handover.id, code: handover.code });
}
