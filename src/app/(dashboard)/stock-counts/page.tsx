import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { canEditStockCount, canViewStockCount } from "@/lib/stock-count-shared";
import StockCountList from "./stock-count-list";

// Đối chiếu tồn kho cuối tháng — Kho thành phẩm. Quản lý kho TP lập/gửi; Trợ lý, Admin cấp cao, HCNS xem;
// Admin cấp cao quyết định (kiểm tra lại / áp số thực tế). Chặn cả Admin thường dù isPageAllowed cho qua.
export default async function StockCountsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/stock-counts"))) redirect("/dashboard");
  if (!canViewStockCount(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-strong" /> Đối chiếu tồn kho cuối tháng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Kho thành phẩm — so tồn trên phần mềm với tồn thực tế, giải trình chênh lệch
        </p>
      </div>
      <StockCountList canCreate={canEditStockCount(role) && !!session?.user?.workplaceWarehouseId} />
    </div>
  );
}
