import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { RefreshCw, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole, REPACK_STATUS_LABELS } from "@/types";
import type { RepackInstructionStatus } from "@prisma/client";
import CreateRepackInstructionDialog from "./create-repack-instruction-dialog";
import AssignRepackStaffCell from "./assign-repack-staff-cell";
import RepackReviewPanel from "./repack-review-panel";

const STATUS_COLORS: Record<RepackInstructionStatus, string> = {
  CREATED: "bg-muted text-text-secondary",
  ASSIGNED: "bg-info-light text-info-foreground",
  IN_PROGRESS: "bg-warning-light text-warning-foreground",
  PENDING_PLACEMENT: "bg-warning-light text-warning-foreground",
  COMPLETED: "bg-primary-light text-primary-strong",
  CANCELLED: "bg-danger-light text-destructive",
};

export default async function RepackInstructionsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/repack-instructions"))) redirect("/dashboard");
  if (role !== "KY_THUAT" && role !== "KHO_MO" && !isAdminRole(role)) redirect("/dashboard");

  const canCreate = role === "KY_THUAT" || isAdminRole(role);

  const where: Record<string, unknown> = {};
  if (role === "KY_THUAT") where.createdById = session!.user.id;
  if (role === "KHO_MO") {
    if (!session!.user.workplaceWarehouseId) redirect("/dashboard");
    where.sourceShelf = { warehouseId: session!.user.workplaceWarehouseId };
  }

  // Không còn cần tải sẵn danh sách NV cấy mô — gán qua AssignRepackStaffCell giờ chỉ cho chọn trong số
  // NV đã đăng ký hoàn thành sớm/làm thêm ĐÃ DUYỆT (tự tải riêng qua GET /api/extra-work-requests
  // ?availableToAssign=true), không chọn tự do mọi NV như trước.
  const instructions = await prisma.repackInstruction.findMany({
    where,
    include: {
      plantType: { select: { code: true, name: true } },
      sourceShelf: { select: { code: true, warehouseId: true } },
      sourceLot: { select: { code: true } },
      assignedTo: { select: { name: true } },
      quantityIssueReportedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const needsAssignment = role === "KHO_MO" ? instructions.filter((i) => i.status === "CREATED") : [];
  const needsReview = role === "KHO_MO" ? instructions.filter((i) => i.status === "PENDING_PLACEMENT") : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-primary-strong" /> Chỉ định cấy xử lý
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Đóng gói lại thành phẩm ở Phòng ra rễ sang quy cách khác (VD T05 → T01)
          </p>
        </div>
        {canCreate && <CreateRepackInstructionDialog />}
      </div>

      {needsAssignment.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-foreground">Cần gán nhân viên cấy mô</h2>
          {needsAssignment.map((inst) => (
            <Card key={inst.id} className={inst.quantityIssueReportedAt ? "border border-destructive" : "border border-info-light"}>
              <CardContent className="py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono font-medium text-info-foreground">{inst.code}</p>
                    <p className="text-sm text-text-secondary">
                      {inst.plantType.code} — {inst.sourceLot.code} ({inst.sourceShelf.code}) —{" "}
                      {inst.inputQuantity.toLocaleString("vi-VN")} cây {inst.inputStageCode} → {inst.outputStageCode}
                    </p>
                  </div>
                  <AssignRepackStaffCell instructionId={inst.id} />
                </div>
                {inst.quantityIssueReportedAt && (
                  <div className="bg-danger-light rounded-lg p-3 text-sm text-destructive flex items-start gap-2">
                    <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">
                        {inst.quantityIssueReportedBy?.name ?? "NV cấy mô"} báo số lượng thực tế trên kệ {inst.sourceShelf.code} không khớp chỉ định
                        {" "}({format(inst.quantityIssueReportedAt, "HH:mm dd/MM/yyyy", { locale: vi })})
                      </p>
                      {inst.quantityIssueNote && <p className="mt-0.5">Ghi chú: {inst.quantityIssueNote}</p>}
                      <p className="mt-0.5 text-xs">Vui lòng kiểm tra lại kệ trước khi gán nhân viên khác.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {needsReview.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-foreground">Cần kiểm tra & sắp xếp</h2>
          {needsReview.map((inst) => (
            <Card key={inst.id} className="border border-warning-light">
              <CardContent className="py-4 space-y-3">
                <div>
                  <p className="font-mono font-medium text-warning-foreground">{inst.code}</p>
                  <p className="text-sm text-text-secondary">
                    {inst.plantType.code} — NV: {inst.assignedTo?.name} — dự kiến {inst.expectedOutputQuantity.toLocaleString("vi-VN")} cây {inst.outputStageCode}
                  </p>
                </div>
                <RepackReviewPanel
                  instruction={{
                    id: inst.id,
                    code: inst.code,
                    reportedPassedQuantity: inst.reportedPassedQuantity,
                    reportedFailedQuantity: inst.reportedFailedQuantity,
                    khoMoInspectedAt: inst.khoMoInspectedAt ? inst.khoMoInspectedAt.toISOString() : null,
                    confirmedPassedQuantity: inst.confirmedPassedQuantity,
                    confirmedFailedQuantity: inst.confirmedFailedQuantity,
                    sourceShelf: { code: inst.sourceShelf.code, warehouseId: inst.sourceShelf.warehouseId },
                  }}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground">Tất cả chỉ định</h2>
        {instructions.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-text-muted">
            <RefreshCw className="w-10 h-10 mx-auto mb-3 text-text-muted" />
            <p>Chưa có chỉ định cấy xử lý nào</p>
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã chỉ định</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã cây</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Quy cách</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">NV cấy mô</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Trạng thái</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Ngày tạo</th>
                      <th className="px-4 py-3 font-bold text-base"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {instructions.map((inst) => (
                      <tr key={inst.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-info-foreground">{inst.code}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{inst.plantType.code}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{inst.inputStageCode} → {inst.outputStageCode}</td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {inst.assignedTo?.name ?? <Badge variant="secondary">Chưa gán</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={STATUS_COLORS[inst.status]}>{REPACK_STATUS_LABELS[inst.status]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {format(inst.createdAt, "dd/MM/yyyy", { locale: vi })}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/repack-instructions/${inst.id}`}>
                            <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                              <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
