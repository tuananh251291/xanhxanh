import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import GoodsReceiptConfirmForm from "./goods-receipt-confirm-form";

export default async function GoodsReceiptConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "KHO_THANH_PHAM" && role !== "QUAN_LY_KHO_THANH_PHAM") redirect("/dashboard");

  const { id } = await params;
  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id },
    select: {
      id: true, code: true, status: true,
      supplier: { select: { code: true, name: true } },
      room: { select: { warehouseId: true } },
      items: {
        select: {
          id: true, stageCode: true, quantityDelivered: true,
          plantType: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!receipt) notFound();
  if (receipt.room.warehouseId !== session?.user?.workplaceWarehouseId) redirect("/goods-receipts");
  if (receipt.status !== "PLANNED") redirect("/goods-receipts");

  return (
    <GoodsReceiptConfirmForm
      receiptId={receipt.id}
      code={receipt.code}
      supplierName={`${receipt.supplier.name} (${receipt.supplier.code})`}
      items={receipt.items.map((i) => ({
        itemId: i.id,
        plantTypeLabel: `${i.plantType.name} (${i.plantType.code})`,
        stageCode: i.stageCode,
        estimatedQuantity: i.quantityDelivered,
      }))}
    />
  );
}
