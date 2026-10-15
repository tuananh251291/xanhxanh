import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Database } from "lucide-react";
import { isAdminRole } from "@/types";
import PlantTypesContent from "../plant-types/plant-types-content";
import MediumTypesContent from "../medium-types/medium-types-content";
import MaterialsContent from "../materials/materials-content";
import ProductPricesContent from "../product-prices/product-prices-content";
import SuppliersContent from "../suppliers/suppliers-content";
import SaleSettingsTabs from "../settings/sale/sale-settings-tabs";
import CustomersBoard from "../settings/sale/customers/customers-board";

// Gộp menu Admin — mỗi tab tái dùng component đã tách khỏi page.tsx gốc (xem *-content.tsx từng thư
// mục), tránh trùng lặp logic với route standalone. Vật tư/Bảng giá/Nhà cung cấp/Cài đặt Sale giữ đúng
// phạm vi SUPER_ADMIN-only như ROLE_NAV hiện có của ADMIN (không mở rộng quyền mới ngoài việc gộp menu).
// Tab "Cài đặt Sale" chỉ nhúng đúng board mặc định (Khách hàng, khớp redirect gốc của /settings/sale) +
// thanh SaleSettingsTabs — bấm sang Thị trường/NV quản lý sẽ điều hướng hẳn sang trang standalone tương
// ứng (KHÔNG nhúng lại toàn bộ 3 board tại đây để tránh tab-trong-tab nhân đôi, xem sale-settings-tabs.tsx).
export default async function MasterDataPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Admin kỹ thuật KHÔNG có trang này dù isAdminRole trả về true cho role đó (xem comment
  // UserRole.ADMIN_KY_THUAT ở schema.prisma).
  if (!isAdminRole(role) || role === "ADMIN_KY_THUAT") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Database className="w-6 h-6 text-primary-strong" /> Cài đặt CSDL chung hệ thống
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Danh sách cây, môi trường{role === "SUPER_ADMIN" ? ", vật tư, bảng giá sản phẩm, nhà cung cấp, cài đặt Sale" : ""}.
        </p>
      </div>

      <Tabs defaultValue="plant-types">
        <TabsList>
          <TabsTrigger value="plant-types">Danh sách cây</TabsTrigger>
          <TabsTrigger value="medium-types">Môi trường</TabsTrigger>
          {role === "SUPER_ADMIN" && (
            <>
              <TabsTrigger value="materials">Vật tư</TabsTrigger>
              <TabsTrigger value="product-prices">Bảng giá sản phẩm</TabsTrigger>
              <TabsTrigger value="suppliers">Nhà cung cấp</TabsTrigger>
              <TabsTrigger value="sale">Cài đặt Sale</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="plant-types" className="mt-4">
          <PlantTypesContent />
        </TabsContent>
        <TabsContent value="medium-types" className="mt-4">
          <MediumTypesContent />
        </TabsContent>
        {role === "SUPER_ADMIN" && (
          <>
            <TabsContent value="materials" className="mt-4">
              <MaterialsContent role={role} />
            </TabsContent>
            <TabsContent value="product-prices" className="mt-4">
              <ProductPricesContent />
            </TabsContent>
            <TabsContent value="suppliers" className="mt-4">
              <SuppliersContent />
            </TabsContent>
            <TabsContent value="sale" className="mt-4 space-y-4">
              <SaleSettingsTabs active="/settings/sale/customers" />
              <CustomersBoard />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
