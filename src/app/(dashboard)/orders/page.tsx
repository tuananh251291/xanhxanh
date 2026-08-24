import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart, ClipboardList, PackageOpen, ChevronRight } from "lucide-react";
import { isAdminRole } from "@/types";

// Hub liên kết nhẹ (giống /inventory) gộp các mục menu đơn hàng trước đây tách riêng (Tạo đơn hàng/
// Kiểm tra đáp ứng, Danh sách đơn hàng, Sắp xếp đơn hàng) thành 1 mục "Xử lý đơn hàng" — không đụng gì
// tới các trang gốc (mỗi trang tự kiểm tra quyền riêng qua isPageAllowed). NV kho thành phẩm thường
// KHÔNG có mục này — vẫn giữ nguyên "Sắp xếp đơn hàng" riêng như cũ trong ROLE_NAV.
export default async function OrdersHubPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "SALE" && role !== "QUAN_LY_KHO_THANH_PHAM" && !isAdminRole(role)) redirect("/dashboard");

  const isActingForSale = role === "QUAN_LY_KHO_THANH_PHAM";

  const cards = [
    {
      href: "/orders/create",
      icon: ShoppingCart,
      title: isActingForSale ? "Tạo đơn hàng (hộ Sale)" : "Kiểm tra đáp ứng",
      description: isActingForSale
        ? "Tạo/giữ đơn hộ NV bán hàng đang phụ trách khách."
        : "Nhập nhu cầu khách hàng, kiểm tra đáp ứng tồn kho rồi tạm giữ đơn.",
    },
    {
      href: "/orders/list",
      icon: ClipboardList,
      title: "Danh sách đơn hàng",
      description: "Đơn đang tạm giữ và đã xác nhận.",
    },
    ...(role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(role)
      ? [{
          href: "/orders/pack",
          icon: PackageOpen,
          title: "Sắp xếp đơn hàng",
          description: "Đơn đã xác nhận, chờ đóng gói/xuất kho.",
        }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-primary-strong" /> Xử lý đơn hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">Chọn 1 trong các mục dưới đây.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="h-full hover:border-primary transition-colors">
              <CardContent className="flex items-start gap-4 py-6">
                <div className="bg-primary-light p-2.5 rounded-lg shrink-0">
                  <c.icon className="w-6 h-6 text-primary-strong" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{c.title}</p>
                  <p className="text-sm text-text-secondary mt-1">{c.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-text-muted shrink-0 mt-1" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
