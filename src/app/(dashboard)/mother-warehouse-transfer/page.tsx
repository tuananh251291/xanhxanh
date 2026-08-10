import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import MotherWarehouseTransferBoard from "./mother-warehouse-transfer-board";

export default async function MotherWarehouseTransferPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/mother-warehouse-transfer")) || role !== "KHO_MO") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary-strong" /> Bàn giao mẫu mẹ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Chuyển mẫu mẹ sang 1 kho sản xuất khác — trừ tồn ngay khi gửi, kho đích xác nhận số lượng thực
          tế nhận được rồi mới cộng vào tồn kho của họ.
        </p>
      </div>
      <MotherWarehouseTransferBoard />
    </div>
  );
}
