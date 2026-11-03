import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { canViewFinishedHandoverHistory } from "@/lib/finished-handover-history";
import FinishedHistoryBoard from "./finished-history-board";

// "Lịch sử bàn giao thành phẩm" — Quản lý kho thành phẩm (đúng kho mình làm việc) + Admin (mọi kho) xem lại
// mọi phiếu bàn giao thành phẩm từ Phòng ra rễ các khu sản xuất, xuất Excel — xem
// src/lib/finished-handover-history.ts.
export default async function FinishedHandoverHistoryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canViewFinishedHandoverHistory(role)) redirect("/dashboard");
  if (!(await isPageAllowed(role, "/transfers/finished-history"))) redirect("/dashboard");

  const isManager = role === "QUAN_LY_KHO_THANH_PHAM";
  const [sourceWarehouses, finishedWarehouses] = await Promise.all([
    prisma.warehouse.findMany({ where: { type: "SAN_XUAT" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    isManager
      ? Promise.resolve([])
      : prisma.warehouse.findMany({ where: { type: "THANH_PHAM" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <History className="w-6 h-6 text-primary-strong" /> Lịch sử bàn giao thành phẩm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Xem lại toàn bộ phiếu bàn giao cây thành phẩm từ Phòng ra rễ các khu sản xuất về Kho thành phẩm
          {isManager ? " bạn quản lý" : ""} — lọc theo ngày, khu sản xuất, trạng thái và xuất ra Excel.
        </p>
      </div>
      {isManager && !session?.user?.workplaceWarehouseId ? (
        <p className="text-sm text-text-muted">
          Bạn chưa được gán địa điểm làm việc (kho thành phẩm) — liên hệ Admin cấp cao để được gán.
        </p>
      ) : (
        <FinishedHistoryBoard sourceWarehouses={sourceWarehouses} finishedWarehouses={finishedWarehouses} />
      )}
    </div>
  );
}
