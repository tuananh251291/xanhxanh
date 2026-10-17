import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlertForWarehouseStaff } from "@/lib/inventory";
import { z } from "zod";

const schema = z.object({
  lotId: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const confirmed = searchParams.get("confirmed");
  const where: Record<string, unknown> = {};
  if (confirmed === "false") where.confirmedAt = null;
  if (confirmed === "true") where.confirmedAt = { not: null };
  // NV kho mô chỉ làm việc 1 kho sản xuất (nếu đã được gán địa điểm làm việc).
  if (session.user.role === "KHO_MO" && session.user.workplaceWarehouseId) {
    where.lot = { shelf: { warehouseId: session.user.workplaceWarehouseId } };
  }

  const records = await prisma.contaminationRecord.findMany({
    where,
    include: {
      lot: {
        select: {
          code: true,
          stage: true,
          quantity: true,
          initialQuantity: true,
          plantType: { select: { name: true, code: true } },
          shelf: { select: { name: true, warehouse: { select: { name: true } } } },
          instruction: { select: { code: true } },
        },
      },
    },
    orderBy: { recordDate: "desc" },
    take: 100,
  });

  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { lotId, quantity, notes } = parsed.data;

  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: {
      instruction: { select: { assignedToId: true, code: true, inputMotherQuantity: true } },
      shelf: { select: { warehouseId: true } },
    },
  });
  if (!lot) return NextResponse.json({ message: "Không tìm thấy lô" }, { status: 404 });
  if (quantity > lot.quantity) return NextResponse.json({ message: "Số lượng nhiễm vượt quá tồn kho" }, { status: 400 });

  // Tạo record nhiễm (pending xác nhận)
  const record = await prisma.contaminationRecord.create({
    data: { lotId, quantity, notes },
  });

  // Kiểm tra tỉ lệ nhiễm
  const contaminated = await prisma.contaminationRecord.aggregate({
    where: { lotId },
    _sum: { quantity: true },
  });
  const totalContaminated = contaminated._sum.quantity ?? 0;
  const contaminationRate = totalContaminated / lot.initialQuantity;

  if (contaminationRate > 0.2) {
    await createAlertForWarehouseStaff({
      role: "KY_THUAT",
      warehouseId: lot.shelf?.warehouseId,
      type: "CONTAMINATION_HIGH",
      title: "Tỉ lệ nhiễm cao",
      message: `Lô ${lot.code}: ${Math.round(contaminationRate * 100)}% bị nhiễm`,
      relatedId: lotId,
      relatedType: "Lot",
    });
  }

  return NextResponse.json(record, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ message: "Thiếu ID" }, { status: 400 });

  const record = await prisma.contaminationRecord.findUnique({
    where: { id },
    include: { lot: true },
  });
  if (!record) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (record.confirmedAt) return NextResponse.json({ message: "Bản ghi nhiễm này đã được xác nhận" }, { status: 400 });

  // Xác nhận: trừ tồn kho lô — chỉ khi chưa xác nhận (bấm 2 lần không trừ 2 lần) và lô còn đủ tồn.
  const ok = await prisma.$transaction(async (tx) => {
    const locked = await tx.contaminationRecord.updateMany({
      where: { id, confirmedAt: null },
      data: { confirmedAt: new Date(), confirmedById: session.user.id },
    });
    if (locked.count === 0) return "Bản ghi nhiễm này đã được xác nhận";
    const deducted = await tx.lot.updateMany({
      where: { id: record.lotId, quantity: { gte: record.quantity } },
      data: { quantity: { decrement: record.quantity } },
    });
    if (deducted.count === 0) throw new Error(`Lô ${record.lot.code} chỉ còn ${record.lot.quantity}, không đủ trừ ${record.quantity} cây nhiễm`);
    return null;
  }).catch((err: Error) => err.message);
  if (ok) return NextResponse.json({ message: ok }, { status: 400 });

  return NextResponse.json({ success: true });
}
