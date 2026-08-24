import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Truck, PackageCheck, PackageOpen, Eye, AlertTriangle, RotateCcw } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { DAILY_TASK_TYPE_LABELS, CONTAMINATION_PROPOSAL_TYPE_LABELS } from "@/types";
import { getPendingReturnInspections } from "@/lib/return-inspection";
import KhoTpAssignCell from "@/components/shared/khotp-assign-cell";
import ReturnInspectionTable from "@/components/shared/return-inspection-table";
import DailyTaskCreateDialog from "./daily-task-create-dialog";
import DailyTaskCompleteDialog from "./daily-task-complete-dialog";

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
    plantTypes,
    rooms,
    kiemTraCayTasks,
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
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.room.findMany({
      where: { isActive: true, warehouse: { type: "THANH_PHAM", ...(workplaceWarehouseId ? { id: workplaceWarehouseId } : {}) } },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.dailyTask.findMany({
      where: { type: "KIEM_TRA_CAY" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, code: true, status: true, notes: true, resultNotes: true, createdAt: true,
        plantType: { select: { code: true, name: true } },
        room: { select: { name: true } },
        assignedTo: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.dailyTask.findMany({
      where: { type: "DE_XUAT_TRONG_HUY" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, code: true, status: true, notes: true, resultNotes: true, proposedAction: true, createdAt: true,
        plantType: { select: { code: true, name: true } },
        room: { select: { name: true } },
        assignedTo: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

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
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Eye className="w-4 h-4" /> 4. Kiểm tra cây</CardTitle>
          <DailyTaskCreateDialog type="KIEM_TRA_CAY" label="Kiểm tra cây" plantTypes={plantTypes} rooms={rooms} staffOptions={staffAll} />
        </CardHeader>
        <CardContent className="space-y-2">
          {kiemTraCayTasks.length === 0 ? (
            <p className="text-sm text-text-muted py-2">Chưa có nhiệm vụ kiểm tra cây nào</p>
          ) : (
            kiemTraCayTasks.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background rounded-lg border border-divider">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground font-mono">{d.code}</p>
                  <p className="text-xs text-text-secondary">
                    {d.plantType ? `${d.plantType.name} (${d.plantType.code})` : d.room?.name} · Giao {d.assignedTo.name} ({d.assignedTo.code})
                  </p>
                  {d.status === "COMPLETED" && d.resultNotes && (
                    <p className="text-xs text-primary-strong mt-1">Kết quả: {d.resultNotes}</p>
                  )}
                </div>
                {d.status === "PENDING" ? (
                  <DailyTaskCompleteDialog taskId={d.id} code={d.code} type="KIEM_TRA_CAY" subtitle={d.plantType ? `${d.plantType.name} (${d.plantType.code})` : d.room?.name ?? ""} />
                ) : (
                  <Badge variant="completed">Đã hoàn thành</Badge>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> 5. Đề xuất trồng/hủy</CardTitle>
          <DailyTaskCreateDialog type="DE_XUAT_TRONG_HUY" label={DAILY_TASK_TYPE_LABELS.DE_XUAT_TRONG_HUY} plantTypes={plantTypes} rooms={rooms} staffOptions={staffAll} />
        </CardHeader>
        <CardContent className="space-y-2">
          {deXuatTasks.length === 0 ? (
            <p className="text-sm text-text-muted py-2">Chưa có nhiệm vụ đề xuất nào</p>
          ) : (
            deXuatTasks.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background rounded-lg border border-divider">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground font-mono">{d.code}</p>
                  <p className="text-xs text-text-secondary">
                    {d.plantType ? `${d.plantType.name} (${d.plantType.code})` : d.room?.name} · Giao {d.assignedTo.name} ({d.assignedTo.code})
                  </p>
                  {d.status === "COMPLETED" && (
                    <p className="text-xs text-primary-strong mt-1">
                      Đề xuất: {d.proposedAction ? CONTAMINATION_PROPOSAL_TYPE_LABELS[d.proposedAction] : "—"}{d.resultNotes ? ` — ${d.resultNotes}` : ""}
                    </p>
                  )}
                </div>
                {d.status === "PENDING" ? (
                  <DailyTaskCompleteDialog taskId={d.id} code={d.code} type="DE_XUAT_TRONG_HUY" subtitle={d.plantType ? `${d.plantType.name} (${d.plantType.code})` : d.room?.name ?? ""} />
                ) : (
                  <Badge variant="completed">Đã hoàn thành</Badge>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><RotateCcw className="w-4 h-4" /> 6. Trả hàng nhà cung cấp</CardTitle>
        </CardHeader>
        <CardContent>
          <ReturnInspectionTable items={pendingReturnInspections} />
        </CardContent>
      </Card>
    </div>
  );
}
