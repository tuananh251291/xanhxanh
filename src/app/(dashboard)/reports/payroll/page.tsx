import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DollarSign } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canManagePayroll } from "@/types";
import PayrollReportBoard from "./payroll-report-board";

// "Bảng lương" NV cấy mô — chỉ SUPER_ADMIN + NV Hành chính nhân sự (dữ liệu lương nhạy cảm), xem
// src/app/api/reports/payroll/route.ts + src/lib/payroll-calculation.ts. Nhập tham số ở /payroll-settings.
export default async function PayrollReportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canManagePayroll(role)) redirect("/dashboard");

  const warehouses = await prisma.warehouse.findMany({
    where: { type: "SAN_XUAT" },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-primary-strong" /> Bảng lương
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Lương NV cấy mô tính theo kỳ lương (mùng 7 — trước mùng 7 tháng sau), dùng SỐNG giá trị đang cài
          đặt ở &quot;Cài đặt lương&quot; — không lưu lại số cũ khi tham số thay đổi.
        </p>
      </div>
      <PayrollReportBoard warehouses={warehouses} />
    </div>
  );
}
