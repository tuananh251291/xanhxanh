import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole, REPACK_STATUS_LABELS } from "@/types";
import CancelRepackButton from "../cancel-repack-button";

export default async function RepackInstructionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/repack-instructions"))) redirect("/dashboard");

  const { id } = await params;
  const instruction = await prisma.repackInstruction.findUnique({
    where: { id },
    include: {
      plantType: { select: { code: true, name: true } },
      sourceShelf: { select: { code: true, name: true, warehouseId: true, warehouse: { select: { name: true } } } },
      sourceLot: { select: { code: true } },
      createdBy: { select: { name: true, code: true } },
      assignedTo: { select: { name: true, code: true } },
      assignedBy: { select: { name: true } },
      khoMoInspectedBy: { select: { name: true } },
      placedBy: { select: { name: true } },
      actualOutputShelf: { select: { code: true } },
      outputLot: { select: { code: true, quantity: true } },
    },
  });
  if (!instruction) notFound();

  if (role === "CAY_MO" && instruction.assignedToId !== session!.user.id) redirect("/dashboard");
  if (role === "KY_THUAT" && instruction.createdById !== session!.user.id) redirect("/dashboard");
  if (role === "KHO_MO" && instruction.sourceShelf.warehouseId !== session!.user.workplaceWarehouseId) redirect("/dashboard");

  const canCancel =
    (role === "KY_THUAT" && instruction.createdById === session!.user.id || isAdminRole(role)) &&
    !instruction.staffConfirmedAt &&
    instruction.status !== "CANCELLED" &&
    instruction.status !== "COMPLETED";

  const fmt = (d: Date | null) => (d ? format(d, "HH:mm dd/MM/yyyy", { locale: vi }) : "—");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-primary-strong" /> {instruction.code}
          </h1>
          <p className="text-text-secondary text-sm mt-1">{instruction.plantType.code} — {instruction.plantType.name}</p>
        </div>
        <Badge className="text-sm px-3 py-1.5 bg-primary-light text-primary-strong">
          {REPACK_STATUS_LABELS[instruction.status]}
        </Badge>
      </div>

      <Card>
        <CardContent className="py-4 space-y-1 text-sm">
          <p><span className="text-text-muted">Kệ + lô nguồn:</span> <span className="font-medium text-foreground">{instruction.sourceShelf.code} ({instruction.sourceShelf.warehouse.name}) — {instruction.sourceLot.code}</span></p>
          <p><span className="text-text-muted">Chuyển quy cách:</span> <span className="font-medium text-foreground">{instruction.inputStageCode} → {instruction.outputStageCode}</span></p>
          <p><span className="text-text-muted">Số lượng đầu vào:</span> <span className="font-medium text-foreground">{instruction.inputQuantity.toLocaleString("vi-VN")} cây</span></p>
          <p><span className="text-text-muted">Dự kiến đầu ra:</span> <span className="font-medium text-foreground">{instruction.expectedOutputQuantity.toLocaleString("vi-VN")} cây</span></p>
          {instruction.notes && <p><span className="text-text-muted">Ghi chú:</span> <span className="text-foreground">{instruction.notes}</span></p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4 space-y-2 text-sm">
          <h2 className="font-bold text-foreground mb-2">Tiến trình</h2>
          <p><span className="text-text-muted">Tạo bởi:</span> {instruction.createdBy.name} ({instruction.createdBy.code}) — {fmt(instruction.createdAt)}</p>
          <p><span className="text-text-muted">Gán NV cấy mô:</span> {instruction.assignedTo ? `${instruction.assignedTo.name} (${instruction.assignedTo.code})` : "—"}{instruction.assignedBy ? ` bởi ${instruction.assignedBy.name}` : ""} — {fmt(instruction.assignedAt)}</p>
          <p><span className="text-text-muted">NV nhận bàn giao:</span> {fmt(instruction.staffConfirmedAt)}</p>
          <p><span className="text-text-muted">NV bàn giao kết quả:</span> {fmt(instruction.staffHandedBackAt)}{instruction.reportedPassedQuantity != null && ` — tự khai ${instruction.reportedPassedQuantity} đạt / ${instruction.reportedFailedQuantity} không đạt`}</p>
          <p><span className="text-text-muted">Kho mô kiểm tra:</span> {fmt(instruction.khoMoInspectedAt)}{instruction.khoMoInspectedBy ? ` bởi ${instruction.khoMoInspectedBy.name}` : ""}{instruction.confirmedPassedQuantity != null && ` — xác nhận ${instruction.confirmedPassedQuantity} đạt / ${instruction.confirmedFailedQuantity} không đạt`}</p>
          <p><span className="text-text-muted">Sắp xếp lên kệ:</span> {fmt(instruction.placedAt)}{instruction.placedBy ? ` bởi ${instruction.placedBy.name}` : ""}{instruction.actualOutputShelf && ` — kệ ${instruction.actualOutputShelf.code}`}</p>
          {instruction.creditedQuantity != null && (
            <p className="pt-2 border-t"><span className="text-text-muted">Số lượng được ghi nhận (tính lương):</span> <b className="text-primary-strong">{instruction.creditedQuantity.toLocaleString("vi-VN")} cây</b></p>
          )}
        </CardContent>
      </Card>

      {canCancel && <CancelRepackButton instructionId={instruction.id} instructionCode={instruction.code} />}
    </div>
  );
}
