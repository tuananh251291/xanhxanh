import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { MOTHER_WAREHOUSE_TRANSFER_TAG } from "@/types";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json([]);

  const transfers = await prisma.transfer.findMany({
    where: { notes: { startsWith: MOTHER_WAREHOUSE_TRANSFER_TAG }, toWarehouseId: workplaceWarehouseId, status: "PENDING" },
    include: {
      fromWarehouse: { select: { code: true, name: true } },
      fromUser: { select: { code: true, name: true } },
      items: {
        select: {
          quantity: true,
          lot: { select: { stageCode: true, plantType: { select: { code: true, name: true } } } },
        },
      },
    },
    orderBy: { transferredAt: "asc" },
  });

  return NextResponse.json(
    transfers.map((t) => ({
      transferId: t.id,
      code: t.code,
      transferredAt: t.transferredAt,
      fromWarehouseCode: t.fromWarehouse?.code ?? null,
      fromWarehouseName: t.fromWarehouse?.name ?? null,
      fromUserCode: t.fromUser.code,
      fromUserName: t.fromUser.name,
      plantTypeCode: t.items[0]?.lot.plantType.code ?? null,
      plantTypeName: t.items[0]?.lot.plantType.name ?? null,
      stageCode: t.items[0]?.lot.stageCode ?? null,
      sentQuantity: t.items.reduce((s, i) => s + i.quantity, 0),
    }))
  );
}
