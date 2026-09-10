import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import HandoverHistoryBoard from "./handover-history-board";

// "Lịch sử phiếu bàn giao" — Admin cấp cao (mọi cơ sở) + Kho mô (đúng cơ sở mình làm việc) — xem
// src/lib/handover-history.ts + src/app/api/transfers/handover-history/route.ts.
export default async function HandoverHistoryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "SUPER_ADMIN" && role !== "KHO_MO") redirect("/dashboard");
  if (!(await isPageAllowed(role, "/transfers/handover-history"))) redirect("/dashboard");

  const scopeWarehouseId = role === "KHO_MO" ? (session?.user?.workplaceWarehouseId ?? null) : null;

  const [warehouses, staffList] = await Promise.all([
    prisma.warehouse.findMany({
      where: { type: "SAN_XUAT", ...(scopeWarehouseId ? { id: scopeWarehouseId } : {}) },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "CAY_MO", isActive: true, ...(scopeWarehouseId ? { workplaceWarehouseId: scopeWarehouseId } : {}) },
      select: { id: true, code: true, name: true, workplaceWarehouseId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <History className="w-6 h-6 text-primary-strong" /> Lịch sử phiếu bàn giao
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Toàn bộ phiếu bàn giao Phòng tối (Xanh/Vàng/Đỏ và MM dư) NV cấy mô đã tạo — không chỉ phiếu đang
          chờ xử lý — lọc theo ngày và nhân sự.
        </p>
      </div>
      <HandoverHistoryBoard warehouses={warehouses} staffList={staffList} />
    </div>
  );
}
