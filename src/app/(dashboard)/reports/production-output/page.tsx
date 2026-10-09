import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { canManagePayroll } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import ProductionOutputBoard from "./production-output-board";

// "Sản lượng ghi nhận" cho HCNS — theo kỳ lương, khu sản xuất, có đơn giá/thành tiền (xem
// src/lib/production-output-report.ts). Khác "Số lượng ghi nhận" (/reports/production-record, Admin + NV Kỹ
// thuật) ở chỗ tách theo quy cách và quy đổi VNĐ nên chỉ mở cho người xem được Bảng lương.
export default async function ProductionOutputPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canManagePayroll(role) || !(await isPageAllowed(role, "/reports/production-output"))) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Boxes className="w-6 h-6 text-primary-strong" /> Sản lượng ghi nhận
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Sản lượng của NV cấy mô theo mã cây và quy cách trong kỳ lương, tính theo ngày cấy của lô (khớp Bảng lương).
          Thành tiền = Số lượng ghi nhận × Đơn giá quy đổi sản lượng – KPI.
        </p>
      </div>
      <ProductionOutputBoard />
    </div>
  );
}
