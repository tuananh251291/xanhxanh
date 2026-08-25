import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, Truck, PackageCheck, PackageOpen, AlertTriangle, RotateCcw, ClipboardCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { getPendingReturnInspections } from "@/lib/return-inspection";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek } from "date-fns";
import KhoTpAssignCell from "@/components/shared/khotp-assign-cell";
import ReturnInspectionTable from "@/components/shared/return-inspection-table";

export default async function TaskAssignmentPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/task-assignment"))) redirect("/dashboard");

  const canAssign = role === "QUAN_LY_KHO_THANH_PHAM" || role === "ADMIN" || role === "SUPER_ADMIN";
  if (!canAssign) redirect("/dashboard");

  const workplaceWarehouseId = session?.user?.workplaceWarehouseId ?? null;

  const [
    pendingReceipts,
    pendingReturnInspections,
    pendingTransfers,
    pendingOrders,
    staffKhoThanhPham,
    staffAll,
    deXuatTasks,
  ] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where: { status: "PLANNED", room: { warehouseId: workplaceWarehouseId ?? "" } },
      orderBy: { expectedDate: "asc" },
      select: {
        id: true, code: true, expectedDate: true,
        supplier: { select: { code: true, name: true } },
        assignedTo: { select: { id: true, code: true, name: true } },
      },
    }),
    getPendingReturnInspections(workplaceWarehouseId ?? ""),
    prisma.transfer.findMany({
      where: { status: "PENDING", toWarehouse: { type: "THANH_PHAM" } },
      orderBy: { transferredAt: "asc" },
      select: {
        id: true, code: true, transferredAt: true,
        fromUser: { select: { code: true, name: true } },
        fromWarehouse: { select: { name: true } },
        fromRoom: { select: { name: true } },
        assignedTo: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.order.findMany({
      where: { status: "CONFIRMED" },
      orderBy: { confirmedAt: "asc" },
      select: {
        id: true, code: true, customerCode: true, confirmedAt: true,
        sale: { select: { name: true } },
        assignedTo: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "KHO_THANH_PHAM" },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM"] }, ...(workplaceWarehouseId ? { workplaceWarehouseId } : {}) },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.dailyTask.findMany({
      where: { type: "DE_XUAT_TRONG_HUY" },
      orderBy: [{ weekStart: "desc" }, { title: "asc" }, { createdAt: "desc" }],
      take: 60,
      select: {
        id: true, code: true, status: true, title: true, weekStart: true, plantCategoryCodes: true,
        room: { select: { name: true } },
        assignedTo: { select: { id: true, code: true, name: true } },
        proposals: { select: { status: true } },
      },
    }),
  ]);

  const currentWeekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const thisWeekTasks = deXuatTasks.filter((d) => d.weekStart?.getTime() === currentWeekStart.getTime());
  const thisWeekIds = new Set(thisWeekTasks.map((d) => d.id));
  const otherDeXuatTasks = deXuatTasks.filter((d) => !thisWeekIds.has(d.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary-strong" /> Phân công nhiệm vụ ngày
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Giao việc trong ngày cho NV kho thành phẩm — xem tiến độ hoàn thành tại{" "}
          <Link href="/task-progress" className="text-primary-strong underline underline-offset-2">Theo dõi tiến độ hôm nay</Link>.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Truck className="w-4 h-4" /> 1. Nhận hàng từ nhà cung cấp</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pendingReceipts.length === 0 ? (
            <p className="text-sm text-text-muted py-2">Không có kế hoạch nhập hàng nào đang chờ</p>
          ) : (
            pendingReceipts.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background rounded-lg border border-divider">
                <div>
                  <p className="text-sm font-medium text-foreground font-mono">{r.code}</p>
                  <p className="text-xs text-text-secondary">
                    {r.supplier.name} ({r.supplier.code}){r.expectedDate ? ` · Dự kiến ${r.expectedDate.toLocaleDateString("vi-VN")}` : ""}
                  </p>
                </div>
                <KhoTpAssignCell endpoint={`/api/goods-receipts/${r.id}`} assignedTo={r.assignedTo} staffOptions={staffKhoThanhPham} canAssign={canAssign} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PackageCheck className="w-4 h-4" /> 2. Nhận bàn giao từ kho sản xuất</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pendingTransfers.length === 0 ? (
            <p className="text-sm text-text-muted py-2">Không có phiếu bàn giao nào đang chờ</p>
          ) : (
            pendingTransfers.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background rounded-lg border border-divider">
                <div>
                  <p className="text-sm font-medium text-foreground font-mono">{t.code}</p>
                  <p className="text-xs text-text-secondary">
                    {t.fromUser.name} ({t.fromUser.code}) · {t.fromWarehouse?.name}{t.fromRoom ? ` — ${t.fromRoom.name}` : ""}
                  </p>
                </div>
                <KhoTpAssignCell endpoint={`/api/transfers/${t.id}`} assignedTo={t.assignedTo} staffOptions={staffKhoThanhPham} canAssign={canAssign} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PackageOpen className="w-4 h-4" /> 3. Sắp xếp đơn hàng</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pendingOrders.length === 0 ? (
            <p className="text-sm text-text-muted py-2">Không có đơn nào đang chờ đóng gói</p>
          ) : (
            pendingOrders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background rounded-lg border border-divider">
                <div>
                  <p className="text-sm font-medium text-foreground font-mono">{o.code}</p>
                  <p className="text-xs text-text-secondary">Khách {o.customerCode} · NV Sale {o.sale.name}</p>
                </div>
                <KhoTpAssignCell endpoint={`/api/orders/${o.id}`} assignedTo={o.assignedTo} staffOptions={staffKhoThanhPham} canAssign={canAssign} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> 4. Kiểm nhiễm - Đề xuất trồng/hủy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {thisWeekTasks.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-text-secondary mb-1.5">Việc tuần này (tự sinh — cần hoàn thành trước Thứ Sáu, nhắc từ Thứ 4)</p>
              {thisWeekTasks.map((d) => (
                <DeXuatTaskRow key={d.id} d={d} canAssign={canAssign} staffOptions={staffAll} highlight />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted py-2">Việc tuần này chưa được tạo — sẽ tự xuất hiện khi có ai vào trang.</p>
          )}

          {otherDeXuatTasks.length > 0 && (
            <div className="pt-2 border-t border-divider space-y-2">
              <p className="text-xs font-semibold text-text-secondary">Lịch sử</p>
              {otherDeXuatTasks.map((d) => (
                <DeXuatTaskRow key={d.id} d={d} canAssign={canAssign} staffOptions={staffAll} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><RotateCcw className="w-4 h-4" /> 5. Trả hàng nhà cung cấp</CardTitle>
        </CardHeader>
        <CardContent>
          <ReturnInspectionTable items={pendingReturnInspections} />
        </CardContent>
      </Card>
    </div>
  );
}

type DeXuatTask = {
  id: string;
  code: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  title: string | null;
  weekStart: Date | null;
  plantCategoryCodes: string[];
  room: { name: string } | null;
  assignedTo: { id: string; code: string; name: string } | null;
  proposals: { status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" }[];
};

// Hàng hiển thị 1 nhiệm vụ Kiểm nhiễm - Đề xuất trồng/hủy — dùng chung cho việc tuần này (highlight) và
// lịch sử. PENDING luôn có nút "Thực hiện" dẫn sang /task-assignment/de-xuat/[id] (đi qua
// ContaminationProposal có sẵn) — nhiệm vụ chỉ tự chuyển "Đã hoàn thành" khi Admin duyệt hết đề xuất liên
// kết (xem ensureDeXuatTaskCompletion), không phải lúc bấm nút.
function DeXuatTaskRow({
  d, canAssign, staffOptions, highlight,
}: {
  d: DeXuatTask;
  canAssign: boolean;
  staffOptions: { id: string; code: string; name: string }[];
  highlight?: boolean;
}) {
  const scope = d.room ? d.room.name : d.plantCategoryCodes.length > 0 ? d.plantCategoryCodes.join(", ") : null;
  const approvedCount = d.proposals.filter((p) => p.status === "APPROVED").length;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border ${highlight ? "bg-warning-light/30 border-warning" : "bg-background border-divider"}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{d.title ?? d.code}</p>
        <p className="text-xs text-text-secondary">
          <span className="font-mono">{d.code}</span>{scope ? ` · ${scope}` : ""}
          {d.assignedTo ? ` · Giao ${d.assignedTo.name} (${d.assignedTo.code})` : ""}
        </p>
        {d.proposals.length > 0 && (
          <p className="text-xs text-text-muted mt-0.5">{approvedCount}/{d.proposals.length} phiếu đã được Duyệt</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {canAssign && d.status === "PENDING" && (
          <KhoTpAssignCell endpoint={`/api/daily-tasks/${d.id}`} assignedTo={d.assignedTo} staffOptions={staffOptions} canAssign={canAssign} />
        )}
        {d.status === "PENDING" ? (
          <Link href={`/task-assignment/de-xuat/${d.id}`}>
            <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
              <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Thực hiện
            </Button>
          </Link>
        ) : (
          <Badge variant="completed">Đã hoàn thành</Badge>
        )}
      </div>
    </div>
  );
}
