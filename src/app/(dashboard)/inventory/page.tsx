import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Warehouse, Sun, PackageCheck, Package, ChevronRight } from "lucide-react";
import { isAdminRole } from "@/types";

// Hub liên kết nhẹ (giống report-center) gộp 3 mục menu trước đây của Quản lý kho thành phẩm (Xem tồn
// của Khu sản xuất/Xem tồn đạt tiêu chuẩn/Xem tồn thực tế) thành 1 mục "Xem tồn kho" — không đụng gì tới
// 3 trang gốc (mỗi trang tự kiểm tra quyền riêng qua isPageAllowed). NV kho thành phẩm thường KHÔNG có
// mục này — vẫn giữ 2 mục riêng (Xem tồn đạt tiêu chuẩn/Xem tồn thực tế) như cũ trong ROLE_NAV.
export default async function InventoryHubPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "QUAN_LY_KHO_THANH_PHAM" && !isAdminRole(role)) redirect("/dashboard");

  const cards = [
    { href: "/inventory/kho-sang", icon: Sun, title: "Xem tồn của Khu sản xuất", description: "Phòng ra rễ tất cả cơ sở sản xuất — mẫu mẹ và thành phẩm đang lưu tại kho sáng." },
    { href: "/inventory/dat-tieu-chuan", icon: PackageCheck, title: "Xem tồn đạt tiêu chuẩn", description: "Tồn đạt tiêu chuẩn (đã trừ đơn giữ chỗ) — dùng để kiểm tra nhu cầu khách hàng." },
    { href: "/inventory/thanh-pham", icon: Package, title: "Xem tồn thực tế", description: "Tồn thực tế trong kho thành phẩm theo từng phòng." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Warehouse className="w-6 h-6 text-primary-strong" /> Xem tồn kho
        </h1>
        <p className="text-text-secondary text-sm mt-1">Chọn 1 trong 3 loại tồn kho để xem chi tiết.</p>
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
