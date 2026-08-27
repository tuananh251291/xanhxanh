import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Send, PackageCheck, ChevronRight } from "lucide-react";
import { isAdminRole } from "@/types";

// Hub liên kết nhẹ (giống /inventory, /orders) — hiện chỉ có 1 mục "Xuất đơn hàng" nhưng để dạng hub cho
// dễ thêm loại xuất hàng khác sau này (VD xuất trả hàng NCC) mà không cần đổi lại menu.
export default async function ShippingHubPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "KHO_THANH_PHAM" && role !== "QUAN_LY_KHO_THANH_PHAM" && !isAdminRole(role)) redirect("/dashboard");

  const cards = [
    {
      href: "/shipping/orders",
      icon: PackageCheck,
      title: "Xuất đơn hàng",
      description: "Đơn đã sắp xếp xong (nhặt đủ hàng) — xuất kho để trừ tồn thực tế và hoàn tất đơn.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Send className="w-6 h-6 text-primary-strong" /> Xuất hàng
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
