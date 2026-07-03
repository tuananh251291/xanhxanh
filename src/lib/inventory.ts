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

export async function createAlert(data: {
  type: "CONTAMINATION_HIGH" | "OUTPUT_DEVIATION" | "ORDER_EXPIRING" | "ORDER_EXPIRED" | "STOCK_LOW" | "LOT_READY_TRANSFER" | "ORDER_PENDING_PACK" | "MEDIUM_HANDOVER_READY";
  title: string;
  message: string;
  userId?: string;
  targetRole?: "ADMIN" | "KY_THUAT" | "CAY_MO" | "KHO_MO" | "KHO_THANH_PHAM" | "SALE" | "MOI_TRUONG" | "DIEU_PHOI";
  relatedId?: string;
  relatedType?: string;
}) {
  return prisma.alert.create({ data });
}
