import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sumLotQuantity } from "@/types";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { sendMotherStockToWarehouse } from "@/lib/mother-warehouse-transfer";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ shelves: [], destinations: [] });

  const shelves = await prisma.shelf.findMany({
    where: { warehouseId: workplaceWarehouseId, isActive: true, room: { type: "PHONG_MAU_ME" } },
    select: {
      code: true,
      name: true,
      lots: {
        where: { status: "ACTIVE" },
        select: {
          quantity: true,
          stageCode: true,
          plantTypeId: true,
          plantType: { select: { code: true, name: true } },
          instructionItems: {
            where: { instruction: { status: { in: ["ACTIVE", "DRAFT"] }, handedOverAt: null } },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  const shelvesWithBreakdown = shelves
    .map((s) => {
      const byKey = new Map<string, { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; available: number }>();
      for (const lot of s.lots) {
        if (lot.instructionItems.length > 0 || lot.quantity <= 0) continue;
        const key = `${lot.plantTypeId}|${lot.stageCode}`;
        const existing = byKey.get(key);
        if (existing) existing.available += lot.quantity;
        else {
          byKey.set(key, {
            plantTypeId: lot.plantTypeId,
            plantTypeCode: lot.plantType.code,
            plantTypeName: lot.plantType.name,
            stageCode: lot.stageCode,
            available: lot.quantity,
          });
        }
      }
      return { code: s.code, name: s.name, used: sumLotQuantity(s.lots), breakdown: Array.from(byKey.values()) };
    })
    .filter((s) => s.breakdown.length > 0);

  const destinations = await prisma.warehouse.findMany({
    where: { type: "SAN_XUAT", isActive: true, id: { not: workplaceWarehouseId } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({ shelves: shelvesWithBreakdown, destinations });
}

const sendSchema = z.object({
  fromShelfCode: z.string().trim().min(1),
  plantTypeId: z.string().min(1),
  stageCode: z.string().min(1),
  quantity: z.number().int().positive(),
  toWarehouseId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  try {
    const result = await sendMotherStockToWarehouse({
      ...parsed.data,
      fromUserId: session.user.id,
      workplaceWarehouseId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 409 });
    throw e;
  }
}
