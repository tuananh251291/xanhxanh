import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { canEditExchangeRate, canViewExchangeRate } from "@/lib/price-list";
import ExchangeRateBoard from "./exchange-rate-board";

export default async function ExchangeRatesPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canViewExchangeRate(role)) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary-strong" /> Tỉ giá tháng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          NV Kế toán nhập tỉ giá tháng sau trước ngày cuối tháng. Dùng để quy đổi bảng giá (VD Thái Lan USD tự tạo từ bảng Baht) và tính phụ thu
          túi 1 cây các thị trường Đông Nam Á khi lập invoice.
        </p>
      </div>
      <ExchangeRateBoard canEdit={canEditExchangeRate(role)} />
    </div>
  );
}
