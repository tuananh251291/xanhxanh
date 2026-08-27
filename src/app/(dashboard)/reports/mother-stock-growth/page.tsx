import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sprout } from "lucide-react";
import { isAdminRole } from "@/types";
import MotherStockGrowthBoard from "./mother-stock-growth-board";

export default async function MotherStockGrowthPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sprout className="w-6 h-6 text-primary-strong" /> Số lượng mẫu mẹ gia tăng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Sản lượng mẫu mẹ 1 cơ sở sản xuất thực sự làm tăng thêm trong 1 khoảng tuần — tồn cuối kỳ chênh
          lệch, cộng phần đã bàn giao NV chưa cấy hết, cộng phần đã chuyển đi cơ sở khác (không bị trừ).
        </p>
      </div>
      <MotherStockGrowthBoard />
    </div>
  );
}
