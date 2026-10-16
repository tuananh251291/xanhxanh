import { prisma } from "@/lib/prisma";
import { getOrchidStock } from "@/lib/orchid/server";

// Danh mục cho Khách hàng lan — chỉ sản phẩm đang bán + được phép hiển thị; tồn chỉ trả về khi sản phẩm
// cho xem tồn (showStock), giá đã áp giá riêng của khách (nếu có).
export async function getOrchidShopCatalog(customerId: string, productId?: string) {
  const [products, prices, stock] = await Promise.all([
    prisma.orchidProduct.findMany({
      where: { isActive: true, showToCustomer: true, ...(productId ? { id: productId } : {}) },
      orderBy: { name: "asc" },
      include: { priceTiers: { orderBy: { minQuantity: "asc" } } },
    }),
    prisma.orchidCustomerPrice.findMany({ where: { customerId } }),
    getOrchidStock(prisma),
  ]);
  return products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    imageUrls: p.imageUrls,
    youtubeUrl: p.youtubeUrl,
    description: p.description,
    priceTiers: p.priceTiers.map((t) => ({ minQuantity: t.minQuantity, price: t.price })),
    customerPrice: prices.find((c) => c.productId === p.id)?.price ?? null,
    stock: p.showStock ? Math.max(0, stock.get(p.id)?.available ?? 0) : null,
  }));
}
export type OrchidShopProduct = Awaited<ReturnType<typeof getOrchidShopCatalog>>[number];
