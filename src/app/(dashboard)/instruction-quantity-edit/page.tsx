import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import InstructionQuantityEditBoard from "./instruction-quantity-edit-board";
import RepackInstructionsBoard from "../repack-instructions/repack-instructions-board";

// Chỉ Admin cấp cao (SUPER_ADMIN, KHÔNG gồm ADMIN thường) và Kho mô — 2 vai trò duy nhất được sửa lại
// số lượng dùng của chỉ định cấy sau khi đã tạo (xem PATCH .../editQuantities ở
// api/instructions/[id]/route.ts). Với KHO_MO, trang này còn đóng vai trò hub "Chỉ định cấy" gộp chung
// với /instructions cho menu dọc gọn hơn — tab "Chỉ định cấy chưa bàn giao" chỉ là 1 Card liên kết nhẹ
// sang /instructions (KHÔNG nhúng thẳng nội dung — trang đó dùng chung 4 vai trò với query khá phức
// tạp, tránh đụng vào để không rủi ro regress, giống cách đã làm ở production-management/page.tsx).
// Tab "Chỉ định cấy xử lý" nhúng thẳng RepackInstructionsBoard (đã tách khỏi /repack-instructions/page.tsx
// để dùng chung — route gốc vẫn hoạt động độc lập như cũ, KY_THUAT/Admin vẫn thấy riêng).
// Tab "Chỉ định cấy đã tạo" — liên kết nhẹ sang /instructions/list (giống KY_THUAT), trang đó tự lọc lại
// đúng kho của NV Kho mô đang xem (xem where ở instructions/list/page.tsx), KHÔNG thấy được kho khác.
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
          <TabsTrigger value="repack">Chỉ định cấy xử lý</TabsTrigger>
          <TabsTrigger value="list">Chỉ định cấy đã tạo</TabsTrigger>
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
        <TabsContent value="repack" className="mt-4">
          <RepackInstructionsBoard role={role} userId={session!.user.id} workplaceWarehouseId={session!.user.workplaceWarehouseId} />
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          <Card>
            <CardContent className="py-10 flex flex-col items-center text-center gap-3">
              <ClipboardList className="w-8 h-8 text-primary-strong" />
              <div>
                <p className="font-medium text-foreground">Chỉ định cấy đã tạo</p>
                <p className="text-sm text-text-secondary mt-1">
                  Xem toàn bộ chỉ định cấy đã tạo cho kho mình phụ trách — lọc theo mã, ngày, giàn kệ, mã cây, NV cấy
                </p>
              </div>
              <Link
                href="/instructions/list"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline"
              >
                Mở trang Chỉ định cấy đã tạo <ArrowRight className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
