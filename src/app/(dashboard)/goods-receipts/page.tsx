import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { getFinishedAvailableRooms } from "@/lib/processing";
import { formatDistanceToNow, addDays, isPast } from "date-fns";
import { vi } from "date-fns/locale";
import GoodsReceiptForm from "./goods-receipt-form";
import ReturnInspectionDialog from "./return-inspection-dialog";

export default async function GoodsReceiptsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/goods-receipts"))) redirect("/dashboard");

  const [rooms, plantTypes, suppliers, recentReceipts, pendingInspections] = await Promise.all([
    getFinishedAvailableRooms(),
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.goodsReceipt.findMany({
      where: { createdById: session?.user?.id ?? "" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, code: true, notes: true, createdAt: true,
        supplier: { select: { code: true, name: true } },
        items: { select: { quantityDelivered: true, quantityRejected: true, quantityPassed: true } },
      },
    }),
    prisma.goodsReceiptItem.findMany({
      where: { returnedAt: null, receipt: { supplier: { allowsReturn: true } } },
      orderBy: { receipt: { createdAt: "asc" } },
      select: {
        id: true, quantityPassed: true,
        plantType: { select: { code: true, name: true } },
        receipt: { select: { code: true, createdAt: true, supplier: { select: { name: true, returnWindowDays: true } } } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary-strong" /> Nhập hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Ghi nhận hàng nhận từ nhà cung cấp ngoài — số lượng bàn giao cộng vào tồn thực tế, số lượng đạt cộng vào tồn khả dụng.
        </p>
      </div>

      {pendingInspections.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Cần kiểm tra hàng trả lại</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pendingInspections.map((item) => {
              const deadline = addDays(item.receipt.createdAt, item.receipt.supplier.returnWindowDays ?? 0);
              const overdue = isPast(deadline);
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background rounded-lg border border-divider">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">
                      {item.receipt.code} · {item.plantType.name} ({item.plantType.code})
                    </p>
                    <p className="text-xs text-text-secondary">
                      {item.receipt.supplier.name} · Số lượng đạt lúc nhập: {item.quantityPassed.toLocaleString("vi-VN")} cây ·{" "}
                      <Badge variant={overdue ? "overdue" : "in-progress"}>
                        Cần kiểm tra trước {deadline.toLocaleDateString("vi-VN")}
                      </Badge>
                    </p>
                  </div>
                  <ReturnInspectionDialog
                    itemId={item.id}
                    plantTypeLabel={`${item.plantType.name} (${item.plantType.code})`}
                    quantityPassed={item.quantityPassed}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <GoodsReceiptForm rooms={rooms} plantTypes={plantTypes} suppliers={suppliers} />

      {recentReceipts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Phiếu gần đây của bạn</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recentReceipts.map((r) => {
              const delivered = r.items.reduce((s, i) => s + i.quantityDelivered, 0);
              const rejected = r.items.reduce((s, i) => s + i.quantityRejected, 0);
              return (
                <div key={r.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-divider">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">{r.code}</p>
                    <p className="text-xs text-text-secondary">
                      {r.supplier.name} ({r.supplier.code}) · Bàn giao {delivered.toLocaleString("vi-VN")} cây
                      {rejected > 0 && ` · Không đạt ${rejected.toLocaleString("vi-VN")}`}
                      {r.notes ? ` · ${r.notes}` : ""} · {formatDistanceToNow(r.createdAt, { addSuffix: true, locale: vi })}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
