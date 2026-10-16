import Link from "next/link";
import { Flower2 } from "lucide-react";
import { requireOrchidCustomerPage } from "@/lib/orchid/page-guard";
import { getOrchidShopCatalog } from "@/lib/orchid/shop";
import { formatVND, formatNumber } from "@/lib/orchid/labels";
import { OrchidPageHeader } from "@/components/orchid/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import NoCustomerLinked from "./no-customer";

export default async function OrchidShopPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { customer } = await requireOrchidCustomerPage();
  if (!customer) return <NoCustomerLinked />;
  const { q } = await searchParams;
  let products = await getOrchidShopCatalog(customer.id);
  if (q) products = products.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Danh mục sản phẩm" description={`Xin chào ${customer.name} — chọn sản phẩm để xem chi tiết, video và đặt hàng`} />
      <form className="flex gap-2 max-w-md">
        <input name="q" defaultValue={q} placeholder="Tìm sản phẩm…" className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm" />
        <button className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-primary-light">Tìm</button>
      </form>
      {products.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-text-muted">Chưa có sản phẩm nào</CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => {
            const fromPrice = p.customerPrice ?? Math.min(...p.priceTiers.map((t) => t.price));
            return (
              <Link key={p.id} href={`/orchid-shop/products/${p.id}`}>
                <Card className="h-full overflow-hidden hover:shadow-md transition-shadow">
                  <div className="aspect-square bg-primary-light flex items-center justify-center">
                    {p.imageUrls[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrls[0]} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <Flower2 className="w-12 h-12 text-primary-strong/50" />
                    )}
                  </div>
                  <CardContent className="p-3 space-y-1">
                    <p className="font-semibold text-foreground line-clamp-2">{p.name}</p>
                    <p className="text-xs font-mono text-text-muted">{p.code}</p>
                    {p.priceTiers.length > 0 && (
                      <p className="text-primary-strong font-bold">
                        {p.customerPrice == null && p.priceTiers.length > 1 ? "Từ " : ""}{formatVND(fromPrice)}<span className="text-xs font-normal text-text-secondary"> / {p.unit}</span>
                      </p>
                    )}
                    {p.stock != null && (p.stock > 0 ? <Badge variant="completed">Còn {formatNumber(p.stock)} {p.unit}</Badge> : <Badge variant="overdue">Tạm hết hàng</Badge>)}
                    {p.youtubeUrl && <Badge variant="info" className="ml-1">Có video</Badge>}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
