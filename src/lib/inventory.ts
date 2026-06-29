import { prisma } from "@/lib/prisma";

export async function getAvailableQuantity(lotId: string): Promise<number> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return 0;
  const held = await prisma.orderItem.aggregate({
    where: {
      lotId,
      order: { status: "HELD" },
    },
    _sum: { quantity: true },
  });
  return lot.quantity - (held._sum.quantity ?? 0);
}

export async function getSystemConfig(key: string, defaultValue: string): Promise<string> {
  const config = await prisma.systemConfig.findUnique({ where: { key } });
  return config?.value ?? defaultValue;
}

export async function getSuggestedShelves(warehouseId: string, neededQuantity: number) {
  const shelves = await prisma.shelf.findMany({
    where: { warehouseId, isActive: true },
    include: {
      _count: { select: { lots: { where: { status: "ACTIVE" } } } },
    },
    orderBy: [{ rowNumber: "asc" }, { colNumber: "asc" }],
  });

  return shelves
    .filter((s) => {
      if (!s.capacity) return true;
      return s._count.lots < s.capacity;
    })
    .slice(0, 3);
}

export async function createAlert(data: {
  type: "CONTAMINATION_HIGH" | "OUTPUT_DEVIATION" | "ORDER_EXPIRING" | "ORDER_EXPIRED" | "STOCK_LOW" | "LOT_READY_TRANSFER" | "ORDER_PENDING_PACK";
  title: string;
  message: string;
  userId?: string;
  targetRole?: "ADMIN" | "KY_THUAT" | "CAY_MO" | "KHO_MO" | "KHO_THANH_PHAM" | "SALE" | "MOI_TRUONG" | "DIEU_PHOI";
  relatedId?: string;
  relatedType?: string;
}) {
  return prisma.alert.create({ data });
}
