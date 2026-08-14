import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Factory, ClipboardList, ArrowRight } from "lucide-react";
import { isAdminRole } from "@/types";
import WarehousesContent from "../warehouses/warehouses-content";
import NhapKhoContent from "../inventory/nhap-kho/nhap-kho-content";
import ContaminationProposalBoard from "../contamination-proposals/contamination-proposal-board";
import ShelfGroupBoard from "../settings/shelf-groups/shelf-group-board";

// Gộp menu Admin — Kho & Kệ, Nhập kho thủ công, Duyệt đề xuất nhiễm, Nhóm giàn kệ đều tái dùng NGUYÊN
// VẸN component/board đã có (xem warehouses-content.tsx, nhap-kho-content.tsx — tách từ page.tsx gốc để
// dùng chung, không trùng lặp logic). Riêng "Chỉ định cấy" KHÔNG nhúng thẳng nội dung route /instructions
// (route đó dùng chung 4 vai trò, với SUPER_ADMIN/ADMIN vốn đã chỉ hiện 1 thẻ gọn trỏ /instructions/list
// — nhúng nguyên logic 150+ dòng query của route đó vào đây không đáng, chỉ cần 1 thẻ dẫn sang y hệt).
export default async function ProductionManagementPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Factory className="w-6 h-6 text-primary-strong" /> Quản lý Khu sản xuất
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Kho & giàn kệ, chỉ định cấy, nhập kho thủ công, duyệt đề xuất nhiễm{role === "SUPER_ADMIN" ? ", nhóm giàn kệ" : ""}.
        </p>
      </div>

      <Tabs defaultValue="warehouses">
        <TabsList>
          <TabsTrigger value="warehouses">Kho & Kệ</TabsTrigger>
          <TabsTrigger value="instructions">Chỉ định cấy</TabsTrigger>
          <TabsTrigger value="nhap-kho">Nhập kho thủ công</TabsTrigger>
          <TabsTrigger value="contamination">Duyệt đề xuất nhiễm</TabsTrigger>
          {role === "SUPER_ADMIN" && <TabsTrigger value="shelf-groups">Nhóm giàn kệ</TabsTrigger>}
        </TabsList>

        <TabsContent value="warehouses" className="mt-4">
          <WarehousesContent role={role} />
        </TabsContent>

        <TabsContent value="instructions" className="mt-4">
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <ClipboardList className="w-8 h-8 text-primary-strong mx-auto" />
              <p className="text-text-secondary">Xem và quản lý chỉ định cấy ở trang riêng.</p>
              <Link href="/instructions">
                <Button className="bg-primary hover:bg-primary-hover">
                  Mở trang Chỉ định cấy <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nhap-kho" className="mt-4">
          <NhapKhoContent role={role} workplaceWarehouseId={session!.user.workplaceWarehouseId} />
        </TabsContent>

        <TabsContent value="contamination" className="mt-4">
          <ContaminationProposalBoard canSubmit={false} canApprove={true} />
        </TabsContent>

        {role === "SUPER_ADMIN" && (
          <TabsContent value="shelf-groups" className="mt-4">
            <ShelfGroupBoard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
