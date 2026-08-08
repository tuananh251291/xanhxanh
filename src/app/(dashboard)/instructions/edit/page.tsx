import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import InstructionQuantityEditBoard from "../../instruction-quantity-edit/instruction-quantity-edit-board";
import DailyRecordEditBoard from "../../daily-record-edit/daily-record-edit-board";

// Gộp 2 trang trước đây tách rời (Sửa SL chỉ định cấy + Sửa cập nhật dữ liệu cấy) thành 1 mục menu duy
// nhất cho Admin cấp cao — mỗi trang trước đây có phạm vi quyền KHÁC NHAU (ADMIN thường vẫn dùng riêng
// Sửa cập nhật dữ liệu cấy, KHO_MO vẫn dùng riêng Sửa SL chỉ định cấy, xem ROLE_NAV) nên chỉ SUPER_ADMIN
// mới thấy trang gộp này; 2 trang gốc vẫn giữ nguyên logic/quyền truy cập như cũ, chỉ không còn hiện
// riêng trong menu của SUPER_ADMIN nữa. Board component dùng lại NGUYÊN VẸN, không sửa gì bên trong.
export default async function InstructionEditPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <Tabs defaultValue="quantity">
      <TabsList>
        <TabsTrigger value="quantity">Sửa SL chỉ định cấy</TabsTrigger>
        <TabsTrigger value="daily">Sửa cập nhật dữ liệu cấy</TabsTrigger>
      </TabsList>
      <TabsContent value="quantity" className="mt-4">
        <InstructionQuantityEditBoard role="SUPER_ADMIN" />
      </TabsContent>
      <TabsContent value="daily" className="mt-4">
        <DailyRecordEditBoard />
      </TabsContent>
    </Tabs>
  );
}
