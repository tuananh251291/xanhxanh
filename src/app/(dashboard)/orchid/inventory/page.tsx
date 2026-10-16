import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidStock } from "@/lib/orchid/server";
import { getOrchidProductOptions, getOrchidWarehouseOptions } from "@/lib/orchid/queries";
import { formatVND, formatNumber, formatDateVN } from "@/lib/orchid/labels";
import { OrchidPageHeader, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import ReceiptDialog from "./receipt-dialog";
import DeleteReceiptButton from "./delete-receipt-button";

const TABS = [
  { key: "products", label: "Tồn theo sản phẩm" },
  { key: "lots", label: "Lô hàng" },
  { key: "receipts", label: "Phiếu nhập" },
] as const;

export default async function OrchidInventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; productId?: string; empty?: string }> }) {
  await requireOrchidStaffPage();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "products";
  const [productOptions, warehouses, suppliers] = await Promise.all([
    getOrchidProductOptions(),
    getOrchidWarehouseOptions(),
    prisma.orchidSupplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, paymentTermDays: true } }),
  ]);

  return (
    <div className="space-y-4">
      <OrchidPageHeader
        title="Kho & lô hàng"
        description="Mỗi lần nhập tạo lô riêng; bán/điều chuyển trừ lô theo thứ tự nhập trước – xuất trước"
        actions={<ReceiptDialog products={productOptions} warehouses={warehouses} suppliers={suppliers} />}
      />
      <div className="flex gap-1 border-b border-divider">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/orchid/inventory?tab=${t.key}`}
            className={cn("px-3 py-2 text-sm rounded-t-lg", tab === t.key ? "bg-primary-light text-primary-strong font-semibold" : "text-text-secondary hover:bg-primary-light/50")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {tab === "products" && <ProductStockTab />}
      {tab === "lots" && <LotsTab productId={sp.productId} showEmpty={sp.empty === "1"} products={productOptions} />}
      {tab === "receipts" && <ReceiptsTab />}
    </div>
  );
}

async function ProductStockTab() {
  const [products, stock, lots] = await Promise.all([
    prisma.orchidProduct.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, unit: true } }),
    getOrchidStock(prisma),
    prisma.orchidLot.findMany({ where: { quantityRemaining: { gt: 0 } }, select: { productId: true, quantityRemaining: true, unitCost: true } }),
  ]);
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-primary-light">
              <th className={TH}>Sản phẩm</th>
              <th className={THR}>Số lô còn</th>
              <th className={THR}>Tồn thực</th>
              <th className={THR}>Giữ cho đơn đã chốt</th>
              <th className={THR}>Khả dụng</th>
              <th className={THR}>Giá trị tồn</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <EmptyRow colSpan={6} text="Chưa có sản phẩm" />
            ) : (
              products.map((p) => {
                const s = stock.get(p.id);
                const pl = lots.filter((l) => l.productId === p.id);
                return (
                  <tr key={p.id} className={TR}>
                    <td className={TD}>
                      <Link href={`/orchid/inventory?tab=lots&productId=${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                      <div className="text-xs font-mono text-info-foreground">{p.code}</div>
                    </td>
                    <td className={TDR}>{pl.length}</td>
                    <td className={TDR}>{formatNumber(s?.remaining)}</td>
                    <td className={TDR}>{formatNumber(s?.reserved)}</td>
                    <td className={`${TDR} font-semibold`}>{formatNumber(s?.available)}</td>
                    <td className={TDR}>{formatVND(pl.reduce((a, l) => a + l.quantityRemaining * l.unitCost, 0))}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

const SOURCE_LABELS: Record<string, string> = { RECEIPT: "Phiếu nhập", POINT_RETURN: "Điểm bán trả về" };

async function LotsTab({ productId, showEmpty, products }: { productId?: string; showEmpty: boolean; products: { id: string; code: string; name: string }[] }) {
  const lots = await prisma.orchidLot.findMany({
    where: { ...(productId ? { productId } : {}), ...(showEmpty ? {} : { quantityRemaining: { gt: 0 } }) },
    orderBy: [{ receivedDate: "desc" }, { code: "desc" }],
    take: 500,
    include: { product: { select: { name: true } }, supplier: { select: { name: true } }, warehouse: { select: { name: true } }, receipt: { select: { code: true } } },
  });
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ tab: "lots" });
    const merged = { productId, empty: showEmpty ? "1" : undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/orchid/inventory?${p.toString()}`;
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-text-secondary">Sản phẩm:</span>
        <Link href={qs({ productId: undefined })} className={cn("px-2 py-1 rounded-lg border", !productId ? "bg-primary-light border-primary text-primary-strong" : "border-divider")}>Tất cả</Link>
        {products.map((p) => (
          <Link key={p.id} href={qs({ productId: p.id })} className={cn("px-2 py-1 rounded-lg border", productId === p.id ? "bg-primary-light border-primary text-primary-strong" : "border-divider")}>{p.name}</Link>
        ))}
        <Link href={qs({ empty: showEmpty ? undefined : "1" })} className="ml-auto underline text-text-secondary">{showEmpty ? "Ẩn lô đã hết" : "Hiện cả lô đã hết"}</Link>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Mã lô</th>
                <th className={TH}>Sản phẩm</th>
                <th className={TH}>Nhà cung cấp</th>
                <th className={TH}>Kho</th>
                <th className={TH}>Ngày nhập</th>
                <th className={THR}>SL nhập</th>
                <th className={THR}>SL còn</th>
                <th className={THR}>Giá nhập</th>
                <th className={TH}>Nguồn</th>
                <th className={TH}>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {lots.length === 0 ? (
                <EmptyRow colSpan={10} text="Không có lô nào" />
              ) : (
                lots.map((l) => (
                  <tr key={l.id} className={TR}>
                    <td className={`${TD} font-mono text-info-foreground`}>{l.code}</td>
                    <td className={TD}>{l.product.name}</td>
                    <td className={TD}>{l.supplier?.name ?? "—"}</td>
                    <td className={TD}>{l.warehouse.name}</td>
                    <td className={TD}>{formatDateVN(l.receivedDate)}</td>
                    <td className={TDR}>{formatNumber(l.quantityIn)}</td>
                    <td className={`${TDR} font-semibold`}>{formatNumber(l.quantityRemaining)}</td>
                    <td className={TDR}>{formatVND(l.unitCost)}</td>
                    <td className={TD}>
                      <Badge variant={l.source === "RECEIPT" ? "info" : "outline"}>{SOURCE_LABELS[l.source] ?? l.source}</Badge>
                      {l.receipt && <div className="text-xs text-text-muted mt-0.5">{l.receipt.code}</div>}
                    </td>
                    <td className={`${TD} text-xs text-text-secondary`}>{l.note ?? ""}</td>
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

async function ReceiptsTab() {
  const receipts = await prisma.orchidGoodsReceipt.findMany({
    orderBy: [{ receiptDate: "desc" }, { code: "desc" }],
    take: 300,
    include: {
      supplier: { select: { name: true } },
      warehouse: { select: { name: true } },
      lots: { select: { code: true, quantityIn: true, product: { select: { name: true } } } },
      payments: { select: { amount: true } },
    },
  });
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-primary-light">
              <th className={TH}>Phiếu nhập</th>
              <th className={TH}>Ngày</th>
              <th className={TH}>Nhà cung cấp</th>
              <th className={TH}>Lô hàng</th>
              <th className={THR}>Phải trả</th>
              <th className={THR}>Đã trả</th>
              <th className={TH}>Hạn trả</th>
              <th className={TH}>Người nhập</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <EmptyRow colSpan={9} text="Chưa có phiếu nhập" />
            ) : (
              receipts.map((r) => (
                <tr key={r.id} className={TR}>
                  <td className={`${TD} font-mono text-info-foreground`}>{r.code}<div className="text-xs text-text-muted font-sans">{r.warehouse.name}</div></td>
                  <td className={TD}>{formatDateVN(r.receiptDate)}</td>
                  <td className={TD}>{r.supplier?.name ?? "—"}</td>
                  <td className={TD}>
                    <div className="text-xs space-y-0.5">
                      {r.lots.map((l) => <div key={l.code}><span className="font-mono">{l.code}</span> · {l.product.name} · {formatNumber(l.quantityIn)}</div>)}
                    </div>
                  </td>
                  <td className={TDR}>{formatVND(r.totalAmount)}</td>
                  <td className={TDR}>{formatVND(r.payments.reduce((s, p) => s + p.amount, 0))}</td>
                  <td className={TD}>{formatDateVN(r.dueDate)}</td>
                  <td className={TD}>{r.createdByName}</td>
                  <td className={TD}><DeleteReceiptButton id={r.id} code={r.code} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
