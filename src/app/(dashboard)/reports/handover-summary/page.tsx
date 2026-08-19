import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import HandoverSummaryBoard from "./handover-summary-board";

// Báo cáo cho Admin + NV Hành chính nhân sự (chỉ xem) — xem src/app/api/reports/handover-summary/route.ts.
export default async function HandoverSummaryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "HANH_CHINH_NHAN_SU") redirect("/dashboard");

  const warehouses = await prisma.warehouse.findMany({
    where: { type: "SAN_XUAT" },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-primary-strong" /> Bàn giao & ghi nhận theo tháng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Số lượng bàn giao và số lượng được ghi nhận của từng NV cấy mô, theo kỳ lương (mùng 7 — trước
          mùng 7 tháng sau), lọc được theo cơ sở sản xuất.
        </p>
      </div>
      <HandoverSummaryBoard warehouses={warehouses} />
    </div>
  );
}
