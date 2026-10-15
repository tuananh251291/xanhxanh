import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canAccessSaleCustomerList, canManageSaleCustomers } from "@/types";

export default async function SaleSettingsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Admin cấp cao (SUPER_ADMIN) + NV Trợ lý (chỉ Khách hàng/NV quản lý, xem canManageSaleCustomers).
  if (!canManageSaleCustomers(role)) redirect("/dashboard");
  redirect(canAccessSaleCustomerList(role) ? "/settings/sale/customers" : "/settings/sale/managers");
}
