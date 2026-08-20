import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { vi } from "date-fns/locale";
import { instructionDisplayStatus, STAGE_LABELS, MEDIUM_ORDER_STATUS_LABELS, canManageDailyRecords } from "@/types";
import type { InstructionStatus } from "@prisma/client";
import { PrintButton } from "@/components/shared/print-button";
import { isPageAllowed } from "@/lib/permissions";
import EditDailyRecordDialog from "../edit-daily-record-dialog";
import AddDailyRecordDialog from "../add-daily-record-dialog";
import ConfirmMotherReceivedPanel from "./confirm-mother-received-panel";
import "./print-instruction.css";

const STATUS_COLORS: Record<InstructionStatus, string> = {
  DRAFT: "bg-muted text-text-secondary",
  ACTIVE: "bg-info-light text-info-foreground",
  COMPLETED: "bg-primary-light text-primary-strong",
  CANCELLED: "bg-danger-light text-destructive",
  ENDED: "bg-muted text-foreground",
};

export default async function InstructionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/instructions"))) redirect("/dashboard");

  const { id } = await params;

  const inst = await prisma.plantingInstruction.findUnique({
    where: { id },
    include: {
      plantType: true,
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true, code: true } },
      handedOverBy: { select: { name: true, workplaceWarehouse: { select: { name: true } } } },
      items: {
        include: {
          shelf: { include: { warehouse: { select: { name: true } } } },
          lot: { select: { code: true } },
          motherMedium: { select: { code: true, name: true } },
          finishedMedium: { select: { code: true, name: true } },
          preRootingMotherMedium: { select: { code: true, name: true } },
        },
      },
      dailyRecords: {
        include: {
          staff: { select: { name: true } },
          items: { include: { lot: { select: { code: true, stage: true, stageCode: true } } } },
        },
        orderBy: { recordDate: "desc" },
      },
      lots: {
        include: { shelf: { include: { warehouse: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
      },
      mediumOrder: { select: { id: true, code: true, confirmedAt: true } },
    },
  });

  if (!inst) notFound();

  // Permission: CAY_MO can only see their own
  if (role === "CAY_MO" && inst.assignedToId !== session!.user.id) redirect("/my-instructions");

  const displayStatus = instructionDisplayStatus(inst.status, inst.handedOverAt);

  // Dữ liệu riêng cho "Phiếu chỉ định sản xuất"
  const weekEnd = inst.weekStart ? addDays(inst.weekStart, 6) : null;
  const printRows = inst.items.map((item) => ({
    id: item.id,
    maMauMe: item.lot?.code ?? "—",
    slSach: item.quantity,
  }));
  const totalDeliveredQuantity = printRows.reduce((s, r) => s + r.slSach, 0);
  const m05Total = inst.items.filter((i) => i.stageCode === "M05").reduce((s, i) => s + (i.expectedMotherOutput ?? 0), 0);

  // Tỉ lệ nhân MM/ra TP thực tế (cộng dồn mọi ngày nhật ký) so với mục tiêu (suy từ tỉ lệ KY_THUAT nhập
  // lúc tạo chỉ định) — khớp đúng công thức đang dùng ở POST /api/daily-records và trang Nhập dữ liệu cấy.
  const actualMotherUsed = inst.dailyRecords.reduce((s, r) => s + r.motherUsed, 0);
  const actualMotherOutput = inst.dailyRecords.reduce(
    (s, r) => s + r.items.filter((i) => i.stage === "MAU_ME").reduce((s2, i) => s2 + i.quantityCreated, 0),
    0
  );
  const actualFinishedOutput = inst.dailyRecords.reduce(
    (s, r) => s + r.items.filter((i) => i.stage === "THANH_PHAM").reduce((s2, i) => s2 + i.quantityCreated, 0),
    0
  );
  // Tỉ lệ chỉ định = ĐÚNG số KY_THUAT đã gõ lúc tạo chỉ định (motherSampleRatio/rootingRatio, xem
  // create-instruction-dialog.tsx — dùng CHUNG cho mọi dòng nên lấy dòng đầu có giá trị là đủ), không
  // suy ngược từ m05Total/inputMotherQuantity vì expectedMotherOutput đã làm tròn xuống (Math.floor) nên
  // chia lại có thể lệch nhẹ so với số NV đã gõ.
  const targetMotherRatio = inst.items.find((i) => i.stageCode === "M05" && i.motherSampleRatio !== null)?.motherSampleRatio ?? null;
  const targetFinishedRatio = inst.items.find((i) => i.rootingRatio !== null)?.rootingRatio ?? null;
  // Môi trường dùng chung cho mọi dòng quy cách trong chỉ định (xem create-instruction-dialog.tsx —
  // "Tỉ lệ + môi trường dùng chung"), lấy dòng đầu có giá trị là đủ, cùng cách lấy targetMotherRatio ở trên.
  const motherMediumInfo = inst.items.find((i) => i.motherMedium)?.motherMedium ?? null;
  const finishedMediumInfo = inst.items.find((i) => i.finishedMedium)?.finishedMedium ?? null;
  // Mẫu mẹ tiền ra rễ — cấu hình M05 thứ 2, tùy chọn (xem PlantingInstructionItem.preRootingMotherRatio).
  const targetPreRootingMotherRatio = inst.items.find((i) => i.preRootingMotherRatio !== null)?.preRootingMotherRatio ?? null;
  const preRootingMotherMediumInfo = inst.items.find((i) => i.preRootingMotherMedium)?.preRootingMotherMedium ?? null;
  // Chỉ định có CẢ 2 loại M05 (mẫu mẹ thường + tiền ra rễ, tính độc lập trên CÙNG số MM sử dụng) — chỉ
  // hiện dòng "Tỉ lệ nhân MM tổng" riêng khi có đủ CẢ 2 (gộp 1 tỉ lệ duy nhất sẽ thừa/trùng lặp).
  const hasBothMotherRatios = targetMotherRatio !== null && targetPreRootingMotherRatio !== null;
  // Mục tiêu THỰC SỰ dùng để so sánh với thực tế — cộng gộp nếu có cả 2, hoặc giữ nguyên tỉ lệ đang có
  // (null nếu chỉ định không đặt tỉ lệ nào). NV cấy ra cả 2 loại cùng lúc nên thực tế (actualMotherRatio
  // bên dưới) LUÔN là tổng của cả 2 loại (DailyRecordItem không tách riêng) — so 1 phần với tổng kia sẽ
  // luôn lệch nếu không cộng gộp mục tiêu tương ứng.
  const targetMotherRatioTotal =
    targetMotherRatio !== null || targetPreRootingMotherRatio !== null
      ? (targetMotherRatio ?? 0) + (targetPreRootingMotherRatio ?? 0)
      : null;
  const preRootingMotherTotal = inst.items.reduce((s, i) => s + (i.expectedPreRootingMotherOutput ?? 0), 0);
  // Bảng "SL dự kiến trả" trên phiếu in — chỉ hiện cột nào có số > 0, ẩn hẳn cột không dùng tới (VD chỉ
  // định không có Mẫu mẹ tiền ra rễ, hoặc không ra T05) thay vì hiện cột toàn số 0 gây rối phiếu in.
  const printOutputColumns = [
    { label: "SL M05 (cụm)", value: m05Total },
    { label: "SL M05 tiền ra rễ (cụm)", value: preRootingMotherTotal },
    { label: "SL T01 (cây)", value: inst.plannedT01Quantity ?? 0 },
    { label: "SL T05 (cây)", value: inst.plannedT05Quantity ?? 0 },
  ].filter((c) => c.value > 0);
  const actualMotherRatio = actualMotherUsed > 0 ? actualMotherOutput / actualMotherUsed : null;
  const actualFinishedRatio = actualMotherUsed > 0 ? actualFinishedOutput / actualMotherUsed : null;
  const fmtRatio = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

  // Admin/Admin cấp cao (mọi kho) hoặc KHO_MO (chỉ đúng kho mình làm việc) được sửa/bù nhật ký cấy hộ NV.
  const instructionWarehouseId = inst.items[0]?.shelf?.warehouseId ?? null;
  const canManage = canManageDailyRecords(role, session?.user?.workplaceWarehouseId, instructionWarehouseId);

  // NV cấy mô được giao chỉ định này, đã bàn giao nhưng CHƯA xác nhận nhận mẫu mẹ — hiện khung tích chọn
  // + nút "Nhận bàn giao" (xem confirm-mother-received-panel.tsx). Cùng điều kiện "needsConfirm" trước
  // đây dùng ở /my-instructions, chỉ chuyển hẳn việc xác nhận sang trang này thay vì tự động xác nhận
  // ngay lúc bấm "Xem".
  const needsConfirmMotherReceived = role === "CAY_MO" && inst.assignedToId === session?.user?.id && !!inst.handedOverAt && !inst.motherReceivedAt;

  // Bù dữ liệu ngày NV cấy mô bỏ sót — CHỈ áp dụng cho tuần chỉ định = tuần hiện tại (khớp đúng ràng
  // buộc server ở POST /api/daily-records nhánh canActOnBehalf), và chỉ những ngày đã qua (không bù cho
  // ngày tương lai) chưa có bản ghi nào.
  const now = new Date();
  const isCurrentWeek = !!inst.weekStart && isSameDay(startOfWeek(inst.weekStart, { weekStartsOn: 1 }), startOfWeek(now, { weekStartsOn: 1 }));
  const missingDays =
    canManage && isCurrentWeek && inst.assignedToId && inst.weekStart
      ? Array.from({ length: 7 }, (_, i) => addDays(inst.weekStart!, i))
          .filter((d) => d <= now && !inst.dailyRecords.some((rec) => isSameDay(rec.recordDate, d)))
      : [];

  return (
    <div className="space-y-6">
      {/* Phiếu chỉ định sản xuất — hiển thị luôn trên màn hình, tối ưu in khổ A5 */}
      <div className="pi-page-wrap print:p-0">
        <div className="pi-sheet">
          <header className="pi-header">
            <h1 className="pi-title">PHIẾU CHỈ ĐỊNH SẢN XUẤT</h1>
            <p className="pi-range">
              Từ ngày <strong>{inst.weekStart ? format(inst.weekStart, "dd/MM/yyyy") : "—"}</strong> đến ngày{" "}
              <strong>{weekEnd ? format(weekEnd, "dd/MM/yyyy") : "—"}</strong>
            </p>
            <div className="pi-header-info">
              <span>
                Số phiếu: <strong>{inst.code}</strong>
              </span>
              <span>
                Ngày nhận mẫu:{" "}
                <strong>{inst.motherReceivedAt ? format(inst.motherReceivedAt, "HH:mm dd/MM/yyyy") : "………………"}</strong>
              </span>
            </div>
            <div className="pi-header-info">
              <span>
                Nhân viên: <strong>{inst.assignedTo?.name ?? "………………"}</strong>
              </span>
            </div>
            <p className="pi-legend">
              <strong>MM</strong>: Mẫu mẹ &nbsp;&nbsp; <strong>NV</strong>: Nhân viên &nbsp;&nbsp; <strong>SL</strong>: Số lượng
            </p>
          </header>

          {/* Section 1 — Thông tin giao nhận */}
          <section className="pi-section">
            <h2 className="pi-section-title">1. Thông tin giao nhận</h2>
            <div className="pi-grid2">
              <div className="pi-field">
                <span className="pi-label">Bên giao</span>
                <span className="pi-value">{inst.handedOverBy?.name ?? "………………"}</span>
              </div>
              <div className="pi-field">
                <span className="pi-label">Bên nhận</span>
                <span className="pi-value">{inst.assignedTo?.name ?? "………………"}</span>
              </div>
              <div className="pi-field">
                <span className="pi-label">Vị trí</span>
                <span className="pi-value">
                  {inst.handedOverBy
                    ? `Nhân viên kho${inst.handedOverBy.workplaceWarehouse ? ` - ${inst.handedOverBy.workplaceWarehouse.name}` : ""}`
                    : "………………"}
                </span>
              </div>
              <div className="pi-field">
                <span className="pi-label">Mã nhân viên</span>
                <span className="pi-value">{inst.assignedTo?.code ?? "………………"}</span>
              </div>
            </div>
          </section>

          {/* Section 2 — Thông tin mẫu mẹ */}
          <section className="pi-section">
            <h2 className="pi-section-title">2. Thông tin mẫu mẹ</h2>
            <div className="pi-card-stack">
              {printRows.length > 0 ? (
                printRows.map((r) => (
                  <div className="pi-card-row" key={r.id}>
                    <div className="pi-card-cell">
                      <span className="pi-label">Mã mẫu mẹ</span>
                      <span className="pi-value mono">{r.maMauMe}</span>
                      <span className="pi-subvalue">
                        {inst.plantType.code} · {inst.plantType.name}
                      </span>
                    </div>
                    <div className="pi-card-cell">
                      <span className="pi-label">Số lượng bàn giao (cụm)</span>
                      <span className="pi-value">{r.slSach.toLocaleString("vi-VN")}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="pi-card-row">
                  <div className="pi-card-cell">
                    <span className="pi-label">Mã mẫu mẹ</span>
                    <span className="pi-value">—</span>
                    <span className="pi-subvalue">
                      {inst.plantType.code} · {inst.plantType.name}
                    </span>
                  </div>
                  <div className="pi-card-cell">
                    <span className="pi-label">Số lượng bàn giao</span>
                    <span className="pi-value">—</span>
                  </div>
                </div>
              )}
            </div>
            <p className="pi-total-delivered">Tổng số lượng cụm được giao: {totalDeliveredQuantity.toLocaleString("vi-VN")}</p>
          </section>

          {/* Section 3 — Chỉ định cấy */}
          <section className="pi-section">
            <h2 className="pi-section-title">3. Chỉ định cấy</h2>
            {inst.notes && (
              <p className="pi-notes-text">
                <strong>Ghi chú:</strong> {inst.notes}
              </p>
            )}
            <table className="pi-table">
              <thead>
                <tr>
                  <th>Quy cách</th>
                  {printOutputColumns.map((c) => (
                    <th key={c.label}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="pi-total">
                  <td className="pi-left">SL dự kiến trả</td>
                  {printOutputColumns.map((c) => (
                    <td key={c.label}>{c.value.toLocaleString("vi-VN")}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="pi-notes-text">
              <strong>Tỉ lệ nhân MM:</strong> <span className="pi-ratio-value">{targetMotherRatio === null ? "—" : fmtRatio(targetMotherRatio)}</span>
              &nbsp;&nbsp; <strong>Môi trường nhân MM:</strong> {motherMediumInfo?.code ?? "—"}
            </p>
            {targetPreRootingMotherRatio !== null && (
              <p className="pi-notes-text">
                <strong>Tỉ lệ nhân MM tiền ra rễ:</strong> <span className="pi-ratio-value">{fmtRatio(targetPreRootingMotherRatio)}</span>
                &nbsp;&nbsp; <strong>Môi trường nhân MM tiền ra rễ:</strong> {preRootingMotherMediumInfo?.code ?? "—"}
              </p>
            )}
            {hasBothMotherRatios && targetMotherRatioTotal !== null && (
              <p className="pi-notes-text">
                <strong>Tỉ lệ nhân MM tổng:</strong> <span className="pi-ratio-value">{fmtRatio(targetMotherRatioTotal)}</span>
              </p>
            )}
            <p className="pi-notes-text">
              <strong>Tỉ lệ ra TP:</strong> <span className="pi-ratio-value">{targetFinishedRatio === null ? "—" : fmtRatio(targetFinishedRatio)}</span>
              &nbsp;&nbsp; <strong>Môi trường ra TP:</strong> {finishedMediumInfo?.code ?? "—"}
            </p>
          </section>

          {/* Lưu ý */}
          <section className="pi-section">
            <div className="pi-note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2 L22 20 H2 Z" strokeLinejoin="round" />
                <line x1="12" y1="9" x2="12" y2="14" />
                <circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none" />
              </svg>
              <p>
                Lưu ý: Nếu số lượng sản phẩm cấy ra không đạt như chỉ định cấy, báo cáo ngay cho quản lý trực tiếp để được
                hỗ trợ xử lý kịp thời trong ngày.
              </p>
            </div>
          </section>

          {/* Section 4 — Ký xác nhận */}
          <section className="pi-section">
            <h2 className="pi-section-title">4. Ký xác nhận</h2>
            <div className="pi-sign-grid">
              <div className="pi-sign-col">
                <p className="pi-role">Bên giao</p>
                <div className="pi-sign-space" />
                <p className="pi-hint">(Ký và ghi rõ họ tên)</p>
              </div>
              <div className="pi-sign-col">
                <p className="pi-role">Bên nhận</p>
                <div className="pi-sign-space" />
                <p className="pi-hint">(Ký và ghi rõ họ tên)</p>
              </div>
            </div>
            <p className="pi-confirm">*Tôi xác nhận đã nhận đủ số lượng và hiểu rõ chỉ định cấy.</p>
          </section>

          {needsConfirmMotherReceived && (
            <section className="pi-section print:hidden">
              <ConfirmMotherReceivedPanel instructionId={inst.id} />
            </section>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 print:hidden">
        <Link href="/instructions" className="print:hidden">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground font-mono">{inst.code}</h1>
          <p className="text-text-secondary text-sm">Chỉ định cấy</p>
        </div>
        <Badge className={displayStatus.notStarted ? STATUS_COLORS.DRAFT : STATUS_COLORS[inst.status as InstructionStatus]}>
          {displayStatus.label}
        </Badge>
        {/* Đơn đặt hàng môi trường — nội bộ giữa KY_THUAT/KHO_MO/MOI_TRUONG/Admin, NV cấy mô không có
            quyền xem trang /medium-orders/[id] nên cũng không hiện badge dẫn tới đó cho họ. */}
        {inst.mediumOrder && role !== "CAY_MO" && (
          <Link href={`/medium-orders/${inst.mediumOrder.id}`}>
            <Badge variant="outline" className="cursor-pointer">
              Đơn MT: {inst.mediumOrder.confirmedAt ? MEDIUM_ORDER_STATUS_LABELS.IN_PROGRESS : MEDIUM_ORDER_STATUS_LABELS.UNCONFIRMED}
            </Badge>
          </Link>
        )}
        <PrintButton />
      </div>

      {/* Lots */}
      {inst.lots.length > 0 && (
        <Card className="print:hidden">
          <CardHeader><CardTitle className="text-base">Lô mô ({inst.lots.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-background">
                    <th className="text-left px-4 py-2 text-text-secondary font-bold text-base">Mã lô</th>
                    <th className="text-left px-4 py-2 text-text-secondary font-bold text-base">Giai đoạn</th>
                    <th className="text-left px-4 py-2 text-text-secondary font-bold text-base">Số lượng</th>
                    <th className="text-left px-4 py-2 text-text-secondary font-bold text-base">Kệ</th>
                    <th className="text-left px-4 py-2 text-text-secondary font-bold text-base">Nhập kho</th>
                  </tr>
                </thead>
                <tbody>
                  {inst.lots.map((lot) => (
                    <tr key={lot.id} className="border-b hover:bg-muted">
                      <td className="px-4 py-2 font-mono text-info-foreground">{lot.code}</td>
                      <td className="px-4 py-2"><Badge variant="secondary">{STAGE_LABELS[lot.stage]}</Badge></td>
                      <td className="px-4 py-2 font-medium">
                        {lot.quantity.toLocaleString("vi-VN")} {lot.stage === "MAU_ME" ? "cụm" : "cây"}
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{lot.shelf ? `${lot.shelf.warehouse.name} - ${lot.shelf.name ?? lot.shelf.code}` : "Chưa có kệ"}</td>
                      <td className="px-4 py-2 text-text-secondary">{format(lot.enteredAt, "dd/MM/yyyy", { locale: vi })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Records — Admin/Admin cấp cao/KHO_MO (cùng kho) luôn thấy khung này kể cả chưa có ngày
          nào, để bù dữ liệu các ngày còn thiếu trong tuần hiện tại (xem missingDays) khi NV cấy mô quên
          nhập. */}
      {(inst.dailyRecords.length > 0 || canManage) && (
        <Card className="print:hidden">
          <CardHeader><CardTitle className="text-base">Nhật ký cấy ({inst.dailyRecords.length})</CardTitle></CardHeader>
          <CardContent className={inst.dailyRecords.length === 0 && missingDays.length === 0 ? "" : "p-0"}>
            {inst.dailyRecords.length === 0 && missingDays.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-6">Chưa có dữ liệu ngày nào</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-background">
                      <th className="text-left px-4 py-2 text-text-secondary font-bold text-base">Ngày</th>
                      <th className="text-left px-4 py-2 text-text-secondary font-bold text-base">NV</th>
                      <th className="text-left px-4 py-2 text-text-secondary font-bold text-base">Mẫu mẹ dùng (cụm)</th>
                      <th className="text-left px-4 py-2 text-text-secondary font-bold text-base">Chi tiết</th>
                      {canManage && <th className="px-4 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {inst.dailyRecords.map((rec) => (
                      <tr key={rec.id} className="border-b hover:bg-muted">
                        <td className="px-4 py-2">{format(rec.recordDate, "dd/MM/yyyy", { locale: vi })}</td>
                        <td className="px-4 py-2">{rec.staff.name}</td>
                        <td className="px-4 py-2">{rec.motherUsed.toLocaleString("vi-VN")}</td>
                        <td className="px-4 py-2 text-text-secondary">
                          {rec.items
                            .map((item) => `${item.lot.stageCode}: ${item.quantityCreated.toLocaleString("vi-VN")} ${item.stage === "MAU_ME" ? "cụm" : "cây"}`)
                            .join(" / ")}
                        </td>
                        {/* Sửa nhật ký sai — Admin/Admin cấp cao hoặc KHO_MO cùng kho, xem PATCH /api/daily-records/[id]. */}
                        {canManage && (
                          <td className="px-4 py-2"><EditDailyRecordDialog recordId={rec.id} /></td>
                        )}
                      </tr>
                    ))}
                    {missingDays.map((d) => (
                      <tr key={d.toISOString()} className="border-b hover:bg-muted">
                        <td className="px-4 py-2">{format(d, "dd/MM/yyyy", { locale: vi })}</td>
                        <td className="px-4 py-2">{inst.assignedTo?.name}</td>
                        <td className="px-4 py-2 text-text-muted" colSpan={2}>Chưa có dữ liệu</td>
                        <td className="px-4 py-2">
                          <AddDailyRecordDialog instructionId={inst.id} date={d} staffName={inst.assignedTo?.name ?? ""} />
                        </td>
                      </tr>
                    ))}
                    {inst.dailyRecords.length > 0 && (
                      <tr className="bg-info-light font-semibold">
                        <td className="px-4 py-2" colSpan={2}>Tỉ lệ (lũy kế)</td>
                        <td className="px-4 py-2">{actualMotherUsed.toLocaleString("vi-VN")}</td>
                        <td className="px-4 py-2 text-text-secondary" colSpan={canManage ? 2 : 1}>
                          <span className={targetMotherRatioTotal !== null && actualMotherRatio !== null && actualMotherRatio < targetMotherRatioTotal ? "text-destructive" : ""}>
                            {hasBothMotherRatios ? "Tỉ lệ nhân MM tổng" : "Tỉ lệ nhân MM"}: {actualMotherRatio === null ? "—" : fmtRatio(actualMotherRatio)}
                            {targetMotherRatioTotal !== null && ` (chỉ định ${fmtRatio(targetMotherRatioTotal)})`}
                          </span>
                          {" / "}
                          <span className={targetFinishedRatio !== null && actualFinishedRatio !== null && actualFinishedRatio < targetFinishedRatio ? "text-destructive" : ""}>
                            Tỉ lệ ra TP: {actualFinishedRatio === null ? "—" : fmtRatio(actualFinishedRatio)}
                            {targetFinishedRatio !== null && ` (chỉ định ${fmtRatio(targetFinishedRatio)})`}
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
