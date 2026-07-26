import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PackagePlus } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import StockInForm from "./stock-in-form";

export default async function NhapKhoPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/nhap-kho"))) redirect("/dashboard");
  if (role !== "KHO_MO") redirect("/dashboard");

  const workplaceWarehouseId = session!.user.workplaceWarehouseId;
  const warehouse = workplaceWarehouseId
    ? await prisma.warehouse.findUnique({ where: { id: workplaceWarehouseId }, select: { name: true } })
    : null;

  const plantTypes = warehouse
    ? await prisma.plantType.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackagePlus className="w-6 h-6 text-primary-strong" /> Nhập kho thủ công
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Ghi nhận trực tiếp số lượng cây ra rễ hoặc cụm mẫu mẹ vào 1 giàn kệ trong kho bạn làm việc — hệ thống tự kiểm tra đúng mã cây được phép xếp và sức chứa còn lại của giàn kệ.
        </p>
      </div>

      {!warehouse ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>Bạn chưa được gán kho làm việc — liên hệ Admin cấp cao để được gán trước khi dùng chức năng này</p>
        </CardContent></Card>
      ) : (
        <StockInForm warehouseName={warehouse.name} plantTypes={plantTypes} />
      )}
    </div>
  );
}
