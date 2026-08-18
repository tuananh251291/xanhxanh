import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isPageAllowed } from "@/lib/permissions";
import MotherStockReshelfBoard from "./mother-stock-reshelf-board";
import MotherWarehouseTransferBoard from "../mother-warehouse-transfer/mother-warehouse-transfer-board";

// Gộp menu Kho mô — "Luân chuyển mẫu mẹ" (route /mother-warehouse-transfer, giữ nguyên hoạt động độc
// lập, không đụng gì) gộp làm tab thứ 2 tại đây cho menu dọc gọn hơn. Dùng thẳng lại
// MotherWarehouseTransferBoard (đã tự fetch, không cần tách gì thêm).
export default async function MotherStockReshelfPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/mother-stock-reshelf")) || role !== "KHO_MO") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6 text-primary-strong" /> Sắp xếp kho mẫu mẹ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Sắp xếp mẫu mẹ trong kho — đổi giàn kệ nội bộ hoặc chuyển sang kho sản xuất khác.
        </p>
      </div>

      <Tabs defaultValue="reshelf">
        <TabsList>
          <TabsTrigger value="reshelf">Sắp xếp kho mẫu mẹ</TabsTrigger>
          <TabsTrigger value="transfer">Luân chuyển mẫu mẹ</TabsTrigger>
        </TabsList>

        <TabsContent value="reshelf" className="mt-4">
          <MotherStockReshelfBoard />
        </TabsContent>
        <TabsContent value="transfer" className="mt-4">
          <MotherWarehouseTransferBoard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
