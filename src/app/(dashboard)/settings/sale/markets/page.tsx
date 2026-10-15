import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Flag } from "lucide-react";
import { canEditSaleMarkets, canAccessSaleCustomerList, canManageSaleCustomers } from "@/types";
import SaleSettingsTabs from "../sale-settings-tabs";
import MarketsBoard from "./markets-board";

export default async function SaleMarketsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // NV Trợ lý vào được nhưng chỉ xem — thêm/sửa/bật tắt vẫn CHỈ Admin cấp cao (API /api/markets chặn).
  if (!canManageSaleCustomers(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Flag className="w-6 h-6 text-primary-strong" /> Cài đặt Sale
        </h1>
        <p className="text-text-secondary text-sm mt-1">Danh sách khách hàng, thị trường và phân công nhân viên quản lý cho đội bán hàng.</p>
      </div>
      <SaleSettingsTabs active="/settings/sale/markets" showCustomers={canAccessSaleCustomerList(role)} />
      <MarketsBoard readOnly={!canEditSaleMarkets(role)} />
    </div>
  );
}
