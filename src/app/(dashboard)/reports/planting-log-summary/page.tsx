import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import PlantingLogSummaryBoard from "./planting-log-summary-board";

// Báo cáo cho Admin/Admin cấp cao + NV Kỹ thuật — xem src/app/api/reports/planting-log-summary/route.ts.
export default async function PlantingLogSummaryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT") redirect("/dashboard");

  const [warehouses, staffList, plantTypes] = await Promise.all([
    prisma.warehouse.findMany({ where: { type: "SAN_XUAT" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: "CAY_MO", isActive: true },
      select: { id: true, code: true, name: true, workplaceWarehouseId: true },
      orderBy: { name: "asc" },
    }),
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary-strong" /> Dữ liệu nhật ký cấy
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Theo từng NV cấy mô — số cây được cấy (mẫu mẹ dùng để cấy vào), số lượng cấy ra mẫu mẹ và thành
          phẩm. Lọc theo khu sản xuất, nhân sự, mã cây, tuần hoặc tháng.
        </p>
      </div>
      <PlantingLogSummaryBoard warehouses={warehouses} staffList={staffList} plantTypes={plantTypes} />
    </div>
  );
}
