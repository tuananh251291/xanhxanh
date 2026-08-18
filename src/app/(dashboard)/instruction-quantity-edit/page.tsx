import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import InstructionQuantityEditBoard from "./instruction-quantity-edit-board";

// Chỉ Admin cấp cao (SUPER_ADMIN, KHÔNG gồm ADMIN thường) và Kho mô — 2 vai trò duy nhất được sửa lại
// số lượng dùng của chỉ định cấy sau khi đã tạo (xem PATCH .../editQuantities ở
// api/instructions/[id]/route.ts). Với KHO_MO, trang này còn đóng vai trò hub "Chỉ định cấy" gộp chung
// với /instructions cho menu dọc gọn hơn — tab "Chỉ định cấy chưa bàn giao" chỉ là 1 Card liên kết nhẹ
// sang /instructions (KHÔNG nhúng thẳng nội dung — trang đó dùng chung 4 vai trò với query khá phức
// tạp, tránh đụng vào để không rủi ro regress, giống cách đã làm ở production-management/page.tsx).
// SUPER_ADMIN không cần hub này nên vẫn giữ nguyên hành vi cũ (chỉ thấy thẳng bảng sửa số lượng).
export default async function InstructionQuantityEditPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "SUPER_ADMIN" && role !== "KHO_MO") redirect("/dashboard");

  if (role === "SUPER_ADMIN") return <InstructionQuantityEditBoard role={role} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary-strong" /> Chỉ định cấy
        </h1>
      </div>

      <Tabs defaultValue="instructions">
        <TabsList>
          <TabsTrigger value="instructions">Chỉ định cấy chưa bàn giao</TabsTrigger>
          <TabsTrigger value="quantity-edit">Sửa SL chỉ định cấy</TabsTrigger>
        </TabsList>

        <TabsContent value="instructions" className="mt-4">
          <Card>
            <CardContent className="py-10 flex flex-col items-center text-center gap-3">
              <ClipboardList className="w-8 h-8 text-primary-strong" />
              <div>
                <p className="font-medium text-foreground">Chỉ định cấy chưa bàn giao</p>
                <p className="text-sm text-text-secondary mt-1">
                  Xem danh sách chỉ định cấy cần bàn giao mẫu mẹ cho NV cấy mô
                </p>
              </div>
              <Link
                href="/instructions"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline"
              >
                Mở trang Chỉ định cấy <ArrowRight className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="quantity-edit" className="mt-4">
          <InstructionQuantityEditBoard role={role} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
