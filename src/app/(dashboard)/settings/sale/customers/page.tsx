import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Flag } from "lucide-react";
import { canAccessSaleCustomerList, canManageSaleCustomers } from "@/types";
import SaleSettingsTabs from "../sale-settings-tabs";
import CustomersBoard from "./customers-board";

export default async function SaleCustomersPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // NV Trợ lý hết hạn mục Khách hàng (xem canAccessSaleCustomerList) — menu "Cài đặt Sale" vẫn trỏ về đây, chuyển sang NV quản lý.
  if (!canAccessSaleCustomerList(role)) redirect(canManageSaleCustomers(role) ? "/settings/sale/managers" : "/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Flag className="w-6 h-6 text-primary-strong" /> Cài đặt Sale
        </h1>
        <p className="text-text-secondary text-sm mt-1">Danh sách khách hàng, thị trường và phân công nhân viên quản lý cho đội bán hàng.</p>
      </div>
      <SaleSettingsTabs active="/settings/sale/customers" />
      <CustomersBoard />
    </div>
  );
}
