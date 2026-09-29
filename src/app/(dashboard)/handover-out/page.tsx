import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Send } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isPageAllowed } from "@/lib/permissions";
import { SendTab as SendMotherStockTab } from "../mother-warehouse-transfer/mother-warehouse-transfer-board";
import { getRootingGroupsForHandoff } from "../transfers/finished/rooting-groups";
import TransferFinishedForm from "../transfers/finished/transfer-finished-form";
import ReplantHandoverBoard from "../replant-handovers/replant-handover-board";

const TAB_VALUES = ["mother-stock", "finished", "replant"] as const;

// Gộp 3 luồng Kho mô gửi hàng đi kho/NV khác vào 1 menu — mỗi tab tái dùng NGUYÊN VẸN board/form của
// route gốc (route gốc vẫn hoạt động độc lập, chỉ bỏ khỏi menu dọc KHO_MO, xem ROLE_NAV): "Bàn giao mẫu
// mẹ" (giàn Phòng mẫu mẹ → kho sản xuất khác, xem sendMotherStockToWarehouse), "Bàn giao thành phẩm"
// (Phòng ra rễ → Kho thành phẩm, /transfers/finished), "Bàn giao cây trồng" (đề xuất Trồng lại đã duyệt →
// Nhân viên sản xuất, /replant-handovers).
export default async function HandoverOutPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/handover-out")) || role !== "KHO_MO") redirect("/dashboard");

  const sp = await searchParams;
  const defaultTab = (TAB_VALUES as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "mother-stock";

  const khaDungRoom = await prisma.room.findFirst({
    where: { type: "PHONG_DAT_TIEU_CHUAN", isActive: true, warehouse: { type: "THANH_PHAM", isActive: true } },
  });
  const rootingGroups = khaDungRoom
    ? await getRootingGroupsForHandoff(session!.user.workplaceWarehouseId ?? null)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Send className="w-6 h-6 text-primary-strong" /> Bàn giao liên kho
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Bàn giao mẫu mẹ sang kho sản xuất khác, thành phẩm sang Kho thành phẩm, hoặc cây trồng cho Nhân
          viên sản xuất.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="mother-stock">Bàn giao mẫu mẹ</TabsTrigger>
          <TabsTrigger value="finished">Bàn giao thành phẩm</TabsTrigger>
          <TabsTrigger value="replant">Bàn giao cây trồng</TabsTrigger>
        </TabsList>

        <TabsContent value="mother-stock" className="mt-4">
          <SendMotherStockTab />
        </TabsContent>

        <TabsContent value="finished" className="mt-4">
          {khaDungRoom ? (
            <TransferFinishedForm rootingGroups={rootingGroups} />
          ) : (
            <p className="text-sm text-warning-foreground bg-warning-light rounded-lg p-3">
              Kho thành phẩm chưa có Phòng đạt tiêu chuẩn nào đang hoạt động — cần Admin tạo trước.
            </p>
          )}
        </TabsContent>

        <TabsContent value="replant" className="mt-4">
          <ReplantHandoverBoard canCreate={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
