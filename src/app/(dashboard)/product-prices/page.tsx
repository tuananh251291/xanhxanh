import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import ProductDialog from "./product-dialog";
import UpdatePriceDialog from "./update-price-dialog";

export default async function ProductPricesPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/product-prices"))) redirect("/dashboard");
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    include: { prices: { orderBy: { effectiveMonth: "desc" } } },
  });

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-secondary-foreground" /> Bảng giá sản phẩm
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {products.length} sản phẩm — mã sản phẩm phải khớp đúng &quot;Item code&quot; trên invoice xuất khẩu
            để trang &quot;Kiểm tra giá invoice&quot; của Sale đối chiếu được
          </p>
        </div>
        <ProductDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã SP</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên sản phẩm</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên khoa học</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Đơn vị</th>
                  <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Giá đang áp dụng (USD)</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-text-muted">Chưa có sản phẩm nào</td></tr>
                ) : products.map((p) => {
                  const currentPrice = p.prices.find((pr) => pr.effectiveMonth <= startOfMonth) ?? null;
                  return (
                    <tr key={p.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-info-foreground">{p.code}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{p.name}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary italic">{p.botanicalName ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{p.unit ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                        {currentPrice ? (
                          `$${currentPrice.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        ) : (
                          <Badge className="bg-warning-light text-warning-foreground">Chưa có giá</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <UpdatePriceDialog
                            productId={p.id}
                            productCode={p.code}
                            currentPrice={currentPrice?.price ?? null}
                            history={p.prices.map((pr) => ({
                              id: pr.id,
                              price: pr.price,
                              effectiveMonth: pr.effectiveMonth.toISOString(),
                            }))}
                          />
                          <ProductDialog
                            item={{
                              id: p.id,
                              code: p.code,
                              name: p.name,
                              botanicalName: p.botanicalName ?? undefined,
                              unit: p.unit ?? undefined,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
