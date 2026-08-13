import Link from "next/link";

const TABS = [
  { href: "/settings/sale/customers", label: "Khách hàng" },
  { href: "/settings/sale/markets", label: "Thị trường" },
  { href: "/settings/sale/managers", label: "NV quản lý" },
] as const;

export default function SaleSettingsTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <div className="flex gap-2">
      {TABS.map((tab) => (
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
