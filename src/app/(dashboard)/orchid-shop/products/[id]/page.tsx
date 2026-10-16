import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrchidCustomerPage } from "@/lib/orchid/page-guard";
import { getOrchidShopCatalog } from "@/lib/orchid/shop";
import { formatVND, formatNumber, youtubeEmbedUrl } from "@/lib/orchid/labels";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import NoCustomerLinked from "../../no-customer";
import ProductGallery from "./product-gallery";
import AddToCart from "./add-to-cart";

export default async function OrchidShopProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { customer } = await requireOrchidCustomerPage();
  if (!customer) return <NoCustomerLinked />;
  const { id } = await params;
  const [product] = await getOrchidShopCatalog(customer.id, id);
  if (!product) notFound();
  const embed = youtubeEmbedUrl(product.youtubeUrl);

  return (
    <div className="space-y-4">
      <Link href="/orchid-shop" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-foreground"><ArrowLeft className="w-4 h-4" />Danh mục</Link>
      <div className="grid lg:grid-cols-2 gap-6">
        <ProductGallery images={product.imageUrls} name={product.name} />
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
            <p className="text-sm font-mono text-text-muted">{product.code}</p>
          </div>
          {product.stock != null && (product.stock > 0 ? <Badge variant="completed">Còn {formatNumber(product.stock)} {product.unit}</Badge> : <Badge variant="overdue">Tạm hết hàng</Badge>)}
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold text-primary-strong">Giá bán</p>
              {product.customerPrice != null ? (
                <p className="text-lg font-bold text-primary-strong">{formatVND(product.customerPrice)} <span className="text-sm font-normal text-text-secondary">/ {product.unit} (giá riêng của bạn)</span></p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {product.priceTiers.map((t, i) => {
                      const next = product.priceTiers[i + 1];
                      return (
                        <tr key={t.minQuantity} className="border-b border-divider last:border-0">
                          <td className="py-1.5 text-text-secondary">{next ? `${formatNumber(t.minQuantity)} – ${formatNumber(next.minQuantity - 1)}` : `Từ ${formatNumber(t.minQuantity)}`} {product.unit}</td>
                          <td className="py-1.5 text-right font-semibold">{formatVND(t.price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <AddToCart productId={product.id} unit={product.unit} priceTiers={product.priceTiers} customerPrice={product.customerPrice} stock={product.stock} />
          {product.description && (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-primary-strong">Mô tả</p>
              <p className="text-sm text-foreground whitespace-pre-line">{product.description}</p>
            </div>
          )}
        </div>
      </div>
      {embed && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold text-primary-strong">Video sản phẩm</p>
            <div className="aspect-video w-full max-w-3xl">
              <iframe
                src={embed}
                title={product.name}
                className="w-full h-full rounded-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
