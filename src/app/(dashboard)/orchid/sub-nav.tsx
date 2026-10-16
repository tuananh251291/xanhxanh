"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flower2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/orchid", label: "Tổng quan" },
  { href: "/orchid/orders", label: "Đơn hàng" },
  { href: "/orchid/products", label: "Sản phẩm" },
  { href: "/orchid/customers", label: "Khách hàng" },
  { href: "/orchid/inventory", label: "Kho & lô hàng" },
  { href: "/orchid/suppliers", label: "Nhà cung cấp" },
  { href: "/orchid/debts", label: "Công nợ & thanh toán" },
  { href: "/orchid/invoices", label: "Hoá đơn" },
  { href: "/orchid/retail-points", label: "Điểm bán lẻ" },
  { href: "/orchid/transfers", label: "Điều chuyển" },
  { href: "/orchid/expenses", label: "Chi phí", adminOnly: true },
  { href: "/orchid/reports", label: "Báo cáo", adminOnly: true },
  { href: "/orchid/settings", label: "Cấu hình", adminOnly: true },
];

export default function OrchidSubNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <div className="print:hidden space-y-3">
      <div className="flex items-center gap-2 text-primary-strong">
        <Flower2 className="w-5 h-5" />
        <span className="font-bold">Dự án hoa lan</span>
      </div>
      <nav className="flex gap-1 overflow-x-auto pb-1 border-b border-divider">
        {ITEMS.filter((i) => !i.adminOnly || isSuperAdmin).map((item) => {
          const active = item.href === "/orchid" ? pathname === "/orchid" : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-t-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-primary-light text-primary-strong font-semibold" : "text-text-secondary hover:bg-primary-light/50 hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
