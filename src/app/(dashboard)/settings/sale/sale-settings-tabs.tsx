import Link from "next/link";

const TABS = [
  { href: "/settings/sale/customers", label: "Khách hàng" },
  { href: "/settings/sale/markets", label: "Thị trường" },
  { href: "/settings/sale/managers", label: "NV quản lý" },
] as const;

// showMarkets = false ẩn tab Thị trường — NV Trợ lý chỉ được Khách hàng + NV quản lý (xem canManageSaleCustomers).
export default function SaleSettingsTabs({ active, showMarkets = false }: { active: (typeof TABS)[number]["href"]; showMarkets?: boolean }) {
  return (
    <div className="flex gap-2">
      {TABS.filter((tab) => showMarkets || tab.href !== "/settings/sale/markets").map((tab) => (
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
