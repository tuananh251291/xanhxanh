import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidStock } from "@/lib/orchid/server";
import { formatVND, formatNumber } from "@/lib/orchid/labels";
import { OrchidPageHeader, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ProductDialog from "./product-dialog";

export default async function OrchidProductsPage({ searchParams }: { searchParams: Promise<{ inactive?: string }> }) {
  await requireOrchidStaffPage();
  const { inactive } = await searchParams;
  const showInactive = inactive === "1";
  const [products, suppliers, stock] = await Promise.all([
    prisma.orchidProduct.findMany({
      where: showInactive ? {} : { isActive: true },
      orderBy: { code: "asc" },
      include: { priceTiers: { orderBy: { minQuantity: "asc" } }, supplier: { select: { name: true } } },
    }),
    prisma.orchidSupplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getOrchidStock(prisma),
  ]);

  return (
    <div className="space-y-4">
      <OrchidPageHeader
        title="Sản phẩm"
        description={
          <>
            {products.length} sản phẩm ·{" "}
            <a className="underline" href={showInactive ? "/orchid/products" : "/orchid/products?inactive=1"}>
              {showInactive ? "Ẩn sản phẩm ngừng bán" : "Hiện cả sản phẩm ngừng bán"}
            </a>
          </>
        }
        actions={<ProductDialog suppliers={suppliers} />}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Sản phẩm</th>
                <th className={TH}>Nhà cung cấp</th>
                <th className={TH}>Giá theo mốc SL</th>
                <th className={THR}>Tồn thực</th>
                <th className={THR}>Khả dụng</th>
                <th className={TH}>Hiển thị khách</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <EmptyRow colSpan={7} text="Chưa có sản phẩm nào" />
              ) : (
                products.map((p) => {
                  const s = stock.get(p.id);
                  return (
                    <tr key={p.id} className={TR}>
                      <td className={TD}>
                        <div className="flex items-center gap-3">
                          {p.imageUrls[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrls[0]} alt={p.name} className="w-12 h-12 rounded-lg object-cover border border-divider" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-primary-light" />
                          )}
                          <div>
                            <p className="font-medium">{p.name}</p>
                            <p className="text-xs font-mono text-info-foreground">{p.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className={TD}>{p.supplier?.name ?? "—"}</td>
                      <td className={TD}>
                        <div className="space-y-0.5 text-xs">
                          {p.priceTiers.map((t) => (
                            <div key={t.id}>
                              Từ {formatNumber(t.minQuantity)} {p.unit}: <span className="font-semibold">{formatVND(t.price)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className={TDR}>{formatNumber(s?.remaining)}</td>
                      <td className={TDR}>{formatNumber(s?.available)}</td>
                      <td className={TD}>
                        {!p.isActive ? (
                          <Badge variant="overdue">Ngừng bán</Badge>
                        ) : p.showToCustomer ? (
                          <Badge variant="completed">{p.showStock ? "Hiện + tồn" : "Hiện, ẩn tồn"}</Badge>
                        ) : (
                          <Badge variant="outline">Ẩn</Badge>
                        )}
                      </td>
                      <td className={TD}>
                        <ProductDialog
                          suppliers={suppliers}
                          item={{
                            id: p.id,
                            code: p.code,
                            name: p.name,
                            imageUrls: p.imageUrls,
                            youtubeUrl: p.youtubeUrl,
                            description: p.description,
                            unit: p.unit,
                            supplierId: p.supplierId,
                            note: p.note,
                            showToCustomer: p.showToCustomer,
                            showStock: p.showStock,
                            isActive: p.isActive,
                            priceTiers: p.priceTiers.map((t) => ({ minQuantity: t.minQuantity, price: t.price })),
                          }}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
