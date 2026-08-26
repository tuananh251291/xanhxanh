import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, ClipboardCheck, PackageCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { getFinishedQualifiedRooms } from "@/lib/processing";
import { getPendingReturnInspections } from "@/lib/return-inspection";
import { formatDistanceToNow, isPast } from "date-fns";
import { vi } from "date-fns/locale";
import GoodsReceiptForm from "./goods-receipt-form";
import ReturnInspectionTable from "@/components/shared/return-inspection-table";
import KhoTpAssignCell from "@/components/shared/khotp-assign-cell";
import TransferReceiveBoard from "./transfer-receive-board";

export default async function GoodsReceiptsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/goods-receipts"))) redirect("/dashboard");

  // NV kho thành phẩm chỉ được nhập hàng vào đúng kho thành phẩm mình làm việc (workplaceWarehouseId) —
  // khác các nơi khác dùng getFinishedQualifiedRooms (VD Xử lý cây) vốn KHÔNG giới hạn theo kho.
  const workplaceWarehouseId = session?.user?.workplaceWarehouseId ?? null;
  const canAssign = role === "QUAN_LY_KHO_THANH_PHAM" || role === "ADMIN" || role === "SUPER_ADMIN";

  const [allRooms, plantTypes, suppliers, recentReceipts, pendingInspections, pendingPlans, staffUsers] = await Promise.all([
    getFinishedQualifiedRooms(),
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.goodsReceipt.findMany({
      where: { createdById: session?.user?.id ?? "", status: "CONFIRMED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, code: true, notes: true, createdAt: true,
        supplier: { select: { code: true, name: true } },
        items: { select: { quantityDelivered: true, quantityRejected: true, quantityPassed: true } },
      },
    }),
    getPendingReturnInspections(workplaceWarehouseId ?? ""),
    prisma.goodsReceipt.findMany({
      where: { status: "PLANNED", room: { warehouseId: workplaceWarehouseId ?? "" } },
      orderBy: { expectedDate: "asc" },
      select: {
        id: true, code: true, expectedDate: true, assignmentConfirmedAt: true,
        supplier: { select: { code: true, name: true } },
        items: {
          select: {
            stageCode: true, quantityDelivered: true,
            plantType: { select: { code: true, name: true } },
          },
        },
        assignedTo: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "KHO_THANH_PHAM" },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rooms = allRooms.filter((r) => r.warehouseId === workplaceWarehouseId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary-strong" /> Nhận hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Nhận hàng từ nhà cung cấp ngoài và nhận bàn giao thành phẩm từ kho sản xuất.
        </p>
      </div>

      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <Truck className="w-5 h-5 text-primary-strong" /> 1. Nhận hàng từ nhà cung cấp (NCC)
      </h2>

      {pendingPlans.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Danh sách nhập hàng từ NCC</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pendingPlans.map((plan) => {
              const overdue = plan.expectedDate ? isPast(plan.expectedDate) : false;
              return (
                <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background rounded-lg border border-divider">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">{plan.code} · {plan.supplier.name}</p>
                    <p className="text-xs text-text-secondary flex flex-wrap items-center gap-1.5 mt-0.5">
                      {plan.items.map((i) => `${i.plantType.code} (${i.stageCode}): ${i.quantityDelivered.toLocaleString("vi-VN")} cây`).join(" · ")}
                      {plan.expectedDate && (
                        <Badge variant={overdue ? "overdue" : "in-progress"}>
                          Dự kiến {plan.expectedDate.toLocaleDateString("vi-VN")}
                        </Badge>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <KhoTpAssignCell
                      endpoint={`/api/goods-receipts/${plan.id}`}
                      assignedTo={plan.assignedTo}
                      staffOptions={staffUsers}
                      canAssign={canAssign}
                      confirmedAt={plan.assignmentConfirmedAt}
                    />
                    <Link href={`/goods-receipts/confirm/${plan.id}`}>
                      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                        <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Xác nhận số liệu thật
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {pendingInspections.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Trả hàng nhà cung cấp — cần kiểm tra</CardTitle></CardHeader>
          <CardContent>
            <ReturnInspectionTable items={pendingInspections} />
          </CardContent>
        </Card>
      )}

      {workplaceWarehouseId ? (
        <GoodsReceiptForm rooms={rooms} plantTypes={plantTypes} suppliers={suppliers} />
      ) : (
        <Card><CardContent className="py-8 text-center text-text-muted">
          Bạn chưa được gán địa điểm làm việc (kho thành phẩm) — liên hệ Admin cấp cao để được gán trước khi nhập hàng.
        </CardContent></Card>
      )}

      {recentReceipts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Phiếu gần đây của bạn</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recentReceipts.map((r) => {
              const delivered = r.items.reduce((s, i) => s + i.quantityDelivered, 0);
              const rejected = r.items.reduce((s, i) => s + i.quantityRejected, 0);
              return (
                <div key={r.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-divider">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">{r.code}</p>
                    <p className="text-xs text-text-secondary">
                      {r.supplier.name} ({r.supplier.code}) · Bàn giao {delivered.toLocaleString("vi-VN")} cây
                      {rejected > 0 && ` · Không đạt ${rejected.toLocaleString("vi-VN")}`}
                      {r.notes ? ` · ${r.notes}` : ""} · {formatDistanceToNow(r.createdAt, { addSuffix: true, locale: vi })}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <h2 className="text-lg font-bold text-foreground flex items-center gap-2 pt-2">
        <PackageCheck className="w-5 h-5 text-primary-strong" /> 2. Nhận bàn giao thành phẩm
      </h2>
      <TransferReceiveBoard />
    </div>
  );
}
