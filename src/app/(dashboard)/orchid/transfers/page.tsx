import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidProductOptions, getOrchidWarehouseOptions } from "@/lib/orchid/queries";
import { formatNumber, formatDateVN, ORCHID_TRANSFER_STATUS_LABELS, ORCHID_TRANSFER_TYPE_LABELS } from "@/lib/orchid/labels";
import { OrchidPageHeader, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import TransferDialog from "./transfer-dialog";
import TransferRowActions from "./transfer-row-actions";

export default async function OrchidTransfersPage({ searchParams }: { searchParams: Promise<{ pointId?: string }> }) {
  await requireOrchidStaffPage();
  const { pointId } = await searchParams;
  const [points, products, warehouses, transfers] = await Promise.all([
    prisma.orchidRetailPoint.findMany({ where: { status: { not: "CLOSED" } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    getOrchidProductOptions(),
    getOrchidWarehouseOptions(),
    prisma.orchidTransfer.findMany({
      where: pointId ? { pointId } : {},
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        point: { select: { code: true, name: true } },
        items: { include: { product: { select: { name: true } }, lot: { select: { code: true } } } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <OrchidPageHeader
        title="Điều chuyển hàng"
        description="Kho trung tâm ↔ Điểm bán — mọi điều chuyển đều lưu lịch sử (lô xuất, người giao/nhận, số thực nhận)"
        actions={
          <>
            <TransferDialog type="TO_POINT" points={points} products={products} warehouses={warehouses} defaultPointId={pointId} />
            <TransferDialog type="FROM_POINT" points={points} products={products} warehouses={warehouses} defaultPointId={pointId} />
          </>
        }
      />
      <div className="flex flex-wrap gap-1 text-sm">
        <Link href="/orchid/transfers" className={cn("px-2 py-1 rounded-lg border", !pointId ? "bg-primary-light border-primary text-primary-strong" : "border-divider")}>Tất cả điểm</Link>
        {points.map((p) => (
          <Link key={p.id} href={`/orchid/transfers?pointId=${p.id}`} className={cn("px-2 py-1 rounded-lg border", pointId === p.id ? "bg-primary-light border-primary text-primary-strong" : "border-divider")}>{p.name}</Link>
        ))}
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Mã phiếu</th>
                <th className={TH}>Ngày</th>
                <th className={TH}>Hướng</th>
                <th className={TH}>Điểm bán</th>
                <th className={TH}>Hàng (lô)</th>
                <th className={THR}>Số lượng</th>
                <th className={THR}>Thực nhận</th>
                <th className={TH}>Giao / Nhận</th>
                <th className={TH}>Trạng thái</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <EmptyRow colSpan={10} text="Chưa có phiếu điều chuyển" />
              ) : (
                transfers.map((t) => (
                  <tr key={t.id} className={TR}>
                    <td className={`${TD} font-mono`}>{t.code}<div className="text-xs text-text-muted font-sans">{t.createdByName}</div></td>
                    <td className={TD}>{formatDateVN(t.transferDate)}</td>
                    <td className={TD}>{ORCHID_TRANSFER_TYPE_LABELS[t.type]}</td>
                    <td className={TD}>{t.point.name}</td>
                    <td className={TD}>
                      <div className="text-xs space-y-0.5">
                        {t.items.map((i) => <div key={i.id}>{i.product.name}{i.lot && <span className="font-mono text-text-muted"> [{i.lot.code}]</span>}: {formatNumber(i.quantity)}</div>)}
                      </div>
                    </td>
                    <td className={TDR}>{formatNumber(t.quantity)}</td>
                    <td className={TDR}>{t.receivedQuantity ?? "—"}</td>
                    <td className={TD}>{t.deliveredBy ?? "—"} / {t.receivedBy ?? "—"}{t.note && <div className="text-xs text-text-muted">{t.note}</div>}</td>
                    <td className={TD}>
                      <Badge variant={t.status === "RECEIVED" ? "completed" : t.status === "PENDING" ? "in-progress" : "overdue"}>{ORCHID_TRANSFER_STATUS_LABELS[t.status]}</Badge>
                    </td>
                    <td className={TD}>{t.type === "TO_POINT" && t.status === "PENDING" && <TransferRowActions id={t.id} quantity={t.quantity} />}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
