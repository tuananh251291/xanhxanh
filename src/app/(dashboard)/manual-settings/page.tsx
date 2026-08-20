import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isPageAllowed } from "@/lib/permissions";
import NhapKhoContent from "../inventory/nhap-kho/nhap-kho-content";
import MotherShelfAssignBoard from "../mother-shelf-assign/mother-shelf-assign-board";
import InspectionLaneBoard from "../inspection-lane/inspection-lane-board";

// Hub Kho mô — "Nhập kho thủ công", "Gán mã cây & NV mẫu mẹ", "Cài đặt luồng kiểm tra" gộp làm tab tại
// đây cho menu dọc gọn hơn (xem ROLE_NAV.KHO_MO, src/types/index.ts). 3 URL cũ (/inventory/nhap-kho,
// /mother-shelf-assign, /inspection-lane) vẫn hoạt động độc lập như cũ, dùng thẳng lại các board/content
// đã có, không tách gì thêm — cùng cách đã làm ở production-management/page.tsx và violation-report/page.tsx.
export default async function ManualSettingsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/manual-settings")) || role !== "KHO_MO") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary-strong" /> Cài đặt thủ công
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Nhập kho thủ công, gán mã cây & nhân viên mẫu mẹ, cài đặt luồng kiểm tra.
        </p>
      </div>

      <Tabs defaultValue="nhap-kho">
        <TabsList>
          <TabsTrigger value="nhap-kho">Nhập kho thủ công</TabsTrigger>
          <TabsTrigger value="shelf-assign">Gán mã cây & NV mẫu mẹ</TabsTrigger>
          <TabsTrigger value="inspection-lane">Cài đặt luồng kiểm tra</TabsTrigger>
        </TabsList>

        <TabsContent value="nhap-kho" className="mt-4">
          <NhapKhoContent role={role} workplaceWarehouseId={session!.user.workplaceWarehouseId} />
        </TabsContent>

        <TabsContent value="shelf-assign" className="mt-4">
          <MotherShelfAssignBoard />
        </TabsContent>

        <TabsContent value="inspection-lane" className="mt-4">
          <InspectionLaneBoard workplaceWarehouseId={session?.user?.workplaceWarehouseId ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
