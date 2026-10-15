import Link from "next/link";

const TABS = [
  { href: "/settings/sale/customers", label: "Khách hàng" },
  { href: "/settings/sale/markets", label: "Thị trường" },
  { href: "/settings/sale/managers", label: "NV quản lý" },
] as const;

// NV Trợ lý cũng thấy tab Thị trường nhưng chỉ xem (xem canEditSaleMarkets). Tab Khách hàng ẩn khi
// showCustomers=false (Trợ lý hết hạn mục Khách hàng, xem canAccessSaleCustomerList).
export default function SaleSettingsTabs({ active, showCustomers = true }: { active: (typeof TABS)[number]["href"]; showCustomers?: boolean }) {
  return (
    <div className="flex gap-2">
      {TABS.filter((tab) => showCustomers || tab.href !== "/settings/sale/customers").map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
            active === tab.href
              ? "bg-primary-light text-primary-strong border-primary"
              : "border-border text-text-secondary hover:bg-primary-light/30"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
