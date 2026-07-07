import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, Eye } from "lucide-react";
import Link from "next/link";
import { format, addDays } from "date-fns";
import { vi } from "date-fns/locale";
import { INSTRUCTION_STATUS_LABELS } from "@/types";
import type { InstructionStatus } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import InstructionViewButton from "./instruction-view-button";
import SurplusHandoverButton from "./surplus-handover-button";

const END_REASON_LABELS: Record<string, string> = {
  TIME_UP: "Hết thời gian (qua Chủ nhật)",
  MOTHER_USED_UP: "Đã dùng hết mẫu mẹ được cấp",
};

const STATUS_COLORS: Record<InstructionStatus, string> = {
  DRAFT: "bg-muted text-text-secondary",
  ACTIVE: "bg-info-light text-info-foreground",
  COMPLETED: "bg-primary-light text-primary-strong",
  CANCELLED: "bg-danger-light text-destructive",
  ENDED: "bg-muted text-foreground",
};

// Với chỉ định đang ACTIVE, badge không thể chỉ lấy status DB (luôn là "Đang thực hiện" ngay từ lúc
// tạo) — phải xét thêm handedOverAt/motherReceivedAt vì NV cấy mô chỉ thực sự "đang thực hiện" sau khi
// đã xác nhận nhận mẫu mẹ từ Kho mô, trước đó là "Chưa bàn giao" hoặc "Đã bàn giao / chờ xác nhận".
function cayMoStatusBadge(inst: { handedOverAt: Date | null; motherReceivedAt: Date | null }) {
  if (!inst.handedOverAt) return { label: "Chưa bàn giao", color: "bg-danger-light text-destructive" };
  if (!inst.motherReceivedAt) return { label: "Đã bàn giao / chờ xác nhận", color: "bg-warning-light text-warning-foreground" };
  return { label: "Đang thực hiện", color: "bg-info-light text-info-foreground" };
}

export default async function MyInstructionsPage() {
  const session = await auth();
  if (!session?.user || !(await isPageAllowed(session.user.role, "/my-instructions"))) redirect("/dashboard");

  const instructions = await prisma.plantingInstruction.findMany({
    // Chưa bàn giao thì NV cấy mô chưa có gì để làm — ẩn khỏi danh sách cho tới khi Kho mô đã bàn giao.
    // Chỉ áp dụng cho chỉ định đang active/draft — chỉ định đã hoàn thành/hủy luôn hiện (lịch sử), kể cả
    // vài bản ghi cũ trước khi có field handedOverAt nên có thể chưa từng được set.
    where: {
      assignedToId: session.user.id,
      OR: [{ handedOverAt: { not: null } }, { status: { in: ["COMPLETED", "CANCELLED"] } }],
    },
    include: {
      plantType: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      dailyRecords: { select: { motherChecked: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // MM dư (chỉ áp dụng khi kết thúc do hết thời gian) = tổng mẫu mẹ được cấp - tổng "MM đã kiểm tra".
  const surplusOf = (inst: (typeof instructions)[number]) =>
    inst.inputMotherQuantity - inst.dailyRecords.reduce((s, r) => s + r.motherChecked, 0);

  const active = instructions.filter((i) => i.status === "ACTIVE" || i.status === "DRAFT");
  const ended = instructions.filter((i) => i.status === "ENDED");
  const done = instructions.filter((i) => i.status === "COMPLETED" || i.status === "CANCELLED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Chỉ định cấy của tôi</h1>
        <p className="text-text-secondary text-sm mt-1">{active.length} đang thực hiện · {ended.length} đã kết thúc · {done.length} đã xong</p>
      </div>

      {active.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Đang thực hiện</h2>
          <div className="space-y-3">
            {active.map((inst) => (
              <Card key={inst.id} className="border-l-4 border-l-blue-500">
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-info-foreground">{inst.code}</span>
                        <Badge className={cayMoStatusBadge(inst).color}>
                          {cayMoStatusBadge(inst).label}
                        </Badge>
                        {inst.weekStart && (
                          <span className="text-sm text-text-secondary">
                            Thời gian cấy: Từ <strong>{format(inst.weekStart, "dd/MM/yyyy", { locale: vi })}</strong> đến <strong>{format(addDays(inst.weekStart, 6), "dd/MM/yyyy", { locale: vi })}</strong>
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-foreground">
                        Mã cây: <span className="font-mono">{inst.plantType.code}</span>
                        <span className="inline-block ml-4">Tên cây: {inst.plantType.name}</span>
                      </p>
                      {inst.motherReceivedAt && (
                        <p className="text-xs text-primary-strong font-medium">
                          Đã nhận mẫu mẹ lúc {format(inst.motherReceivedAt, "HH:mm dd/MM/yyyy", { locale: vi })}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {/* Không xét inst.status ở đây — cùng logic với cayMoStatusBadge() phía trên, chỉ dựa vào
                          handedOverAt/motherReceivedAt để tránh trường hợp chỉ định vẫn còn status DRAFT
                          (chưa được kích hoạt) nhưng đã bàn giao thật, khiến nút bị ẩn oan. */}
                      <InstructionViewButton instructionId={inst.id} needsConfirm={!!inst.handedOverAt && !inst.motherReceivedAt} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {ended.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Đã kết thúc</h2>
          <div className="space-y-3">
            {ended.map((inst) => {
              const surplus = surplusOf(inst);
              const canHandoverSurplus = inst.endReason === "TIME_UP" && !inst.surplusHandedOverAt && surplus > 0;
              return (
                <Card key={inst.id} className="border-l-4 border-l-slate-400">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-info-foreground">{inst.code}</span>
                          <Badge className={STATUS_COLORS.ENDED}>Kết thúc</Badge>
                        </div>
                        <p className="font-semibold text-foreground">{inst.plantType.name}</p>
                        <p className="text-sm text-text-secondary">
                          Lý do: {inst.endReason ? END_REASON_LABELS[inst.endReason] : "—"}
                        </p>
                        {inst.endReason === "TIME_UP" && (
                          <p className="text-sm text-text-secondary">
                            MM dư: <strong>{Math.max(0, surplus).toLocaleString("vi-VN")}</strong>
                            {inst.surplusHandedOverAt && (
                              <span className="text-primary-strong ml-2">
                                Đã bàn giao lúc {format(inst.surplusHandedOverAt, "HH:mm dd/MM/yyyy", { locale: vi })}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <Link href={`/instructions/${inst.id}`}>
                          <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1" /> Xem</Button>
                        </Link>
                        {canHandoverSurplus && <SurplusHandoverButton instructionId={inst.id} surplus={surplus} />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary mb-3">Đã hoàn thành / Hủy</h2>
          <div className="space-y-2">
            {done.map((inst) => (
              <Card key={inst.id} className="opacity-70">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-text-secondary">{inst.code}</span>
                      <span className="font-medium text-foreground">{inst.plantType.name}</span>
                      <Badge className={STATUS_COLORS[inst.status as InstructionStatus]}>
                        {INSTRUCTION_STATUS_LABELS[inst.status as InstructionStatus]}
                      </Badge>
                    </div>
                    <Link href={`/instructions/${inst.id}`}>
                      <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {instructions.length === 0 && (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có chỉ định cấy nào được giao cho bạn</p>
        </CardContent></Card>
      )}
    </div>
  );
}
