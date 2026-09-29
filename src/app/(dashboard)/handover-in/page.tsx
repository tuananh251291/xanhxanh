import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isPageAllowed } from "@/lib/permissions";
import { IncomingTab as ReceiveMotherStockTab } from "../mother-warehouse-transfer/mother-warehouse-transfer-board";
import MediumOrdersReceiveBoard from "../medium-orders/receive/medium-orders-receive-board";
import RndWarehouseHandoverBoard from "../rnd-warehouse-handover/rnd-warehouse-handover-board";

const TAB_VALUES = ["mother-stock", "medium", "rnd"] as const;

// Gộp 3 luồng Kho mô nhận hàng từ kho/NV khác vào 1 menu — mỗi tab tái dùng NGUYÊN VẸN board của route
// gốc (route gốc vẫn hoạt động độc lập, chỉ bỏ khỏi menu dọc KHO_MO, xem ROLE_NAV): "Nhận bàn giao mẫu
// mẹ" (kho sản xuất khác gửi tới, xem confirmMotherStockReceipt — thông báo MOTHER_WAREHOUSE_TRANSFER_
// INCOMING trỏ thẳng tới đây, xem ALERT_DETAIL_LINKS), "Nhận bàn giao môi trường" (/medium-orders/receive),
// "Nhận bàn giao R&D" (Admin kỹ thuật gửi từ Kho SX R&D, /rnd-warehouse-handover).
export default async function HandoverInPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/handover-in")) || role !== "KHO_MO") redirect("/dashboard");

  const sp = await searchParams;
  const defaultTab = (TAB_VALUES as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "mother-stock";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-primary-strong" /> Nhận bàn giao liên kho
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Xác nhận nhận mẫu mẹ từ kho sản xuất khác, môi trường, hoặc sản phẩm R&D.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="mother-stock">Nhận bàn giao mẫu mẹ</TabsTrigger>
          <TabsTrigger value="medium">Nhận bàn giao môi trường</TabsTrigger>
          <TabsTrigger value="rnd">Nhận bàn giao R&D</TabsTrigger>
        </TabsList>

        <TabsContent value="mother-stock" className="mt-4">
          <ReceiveMotherStockTab />
        </TabsContent>

        <TabsContent value="medium" className="mt-4">
          <MediumOrdersReceiveBoard />
        </TabsContent>

        <TabsContent value="rnd" className="mt-4">
          <RndWarehouseHandoverBoard isKhoMo={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
