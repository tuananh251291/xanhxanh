import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendRndOutputToWarehouse } from "@/lib/rnd-warehouse-handover";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { z } from "zod";

// GET: danh sách lô R&D (Phòng tối cá nhân của Admin kỹ thuật, đã kiểm tra nhiễm, còn số lượng) sẵn sàng
// bàn giao + danh sách kho sản xuất THẬT khác có thể chọn làm đích — xem sendRndOutputToWarehouse
// (src/lib/rnd-warehouse-handover.ts).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const [lots, warehouses] = await Promise.all([
    prisma.lot.findMany({
      where: {
        status: "ACTIVE",
        quantity: { gt: 0 },
        inspectedAt: { not: null },
        room: { type: "PHONG_TOI", assignedStaffId: session.user.id, warehouse: { isRnd: true } },
      },
      select: {
        id: true, code: true, stage: true, stageCode: true, quantity: true, enteredAt: true,
        plantType: { select: { code: true, name: true } },
      },
      orderBy: { enteredAt: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { type: "SAN_XUAT", isActive: true, isRnd: false },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ lots, warehouses });
}

const sendSchema = z.object({
  lotIds: z.array(z.string()).min(1, "Cần chọn ít nhất 1 lô"),
  toWarehouseId: z.string().min(1, "Cần chọn kho đích"),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  try {
    const result = await sendRndOutputToWarehouse({
      lotIds: parsed.data.lotIds,
      toWarehouseId: parsed.data.toWarehouseId,
      fromUserId: session.user.id,
      notes: parsed.data.notes,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 400 });
    throw e;
  }
}
