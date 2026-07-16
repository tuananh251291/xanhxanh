import { prisma } from "@/lib/prisma";
import type { AlertType } from "@prisma/client";

export async function getAvailableQuantity(lotId: string): Promise<number> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return 0;
  const held = await prisma.orderItem.aggregate({
    where: {
      lotId,
      order: { status: { in: ["HELD", "CONFIRMED"] } },
      OR: [{ processingRequest: null }, { processingRequest: { status: { not: "COMPLETED" } } }],
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
  type: AlertType;
  title: string;
  message: string;
  userId?: string;
  targetRole?: "SUPER_ADMIN" | "ADMIN" | "KY_THUAT" | "CAY_MO" | "KHO_MO" | "KHO_THANH_PHAM" | "SALE" | "MOI_TRUONG" | "DIEU_PHOI";
  relatedId?: string;
  relatedType?: string;
}) {
  return prisma.alert.create({ data });
}
