import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, Eye } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { INSTRUCTION_STATUS_LABELS } from "@/types";
import type { InstructionStatus } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import ConfirmMotherReceivedButton from "./confirm-mother-received-button";
import SurplusHandoverButton from "./surplus-handover-button";

const END_REASON_LABELS: Record<string, string> = {
  TIME_UP: "Hết thời gian (qua Chủ nhật)",
  MOTHER_USED_UP: "Đã dùng hết mẫu mẹ được cấp",
};

const STATUS_COLORS: Record<InstructionStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
  ENDED: "bg-slate-200 text-slate-700",
};

// Với chỉ định đang ACTIVE, badge không thể chỉ lấy status DB (luôn là "Đang thực hiện" ngay từ lúc
// tạo) — phải xét thêm handedOverAt/motherReceivedAt vì NV cấy mô chỉ thực sự "đang thực hiện" sau khi
// đã xác nhận nhận mẫu mẹ từ Kho mô, trước đó là "Chưa bàn giao" hoặc "Đã bàn giao / chờ xác nhận".
function cayMoStatusBadge(inst: { handedOverAt: Date | null; motherReceivedAt: Date | null }) {
  if (!inst.handedOverAt) return { label: "Chưa bàn giao", color: "bg-red-100 text-red-700" };
  if (!inst.motherReceivedAt) return { label: "Đã bàn giao / chờ xác nhận", color: "bg-amber-100 text-amber-700" };
  return { label: "Đang thực hiện", color: "bg-blue-100 text-blue-700" };
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
      items: {
        include: {
          motherMedium: { select: { name: true } },
          finishedMedium: { select: { name: true } },
        },
      },
      dailyRecords: { select: { motherChecked: true } },
      _count: { select: { dailyRecords: true, lots: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const mediumNames = (inst: (typeof instructions)[number]) =>
    Array.from(new Set(inst.items.flatMap((i) => [i.motherMedium?.name, i.finishedMedium?.name]).filter((n): n is string => !!n)));

  // MM dư (chỉ áp dụng khi kết thúc do hết thời gian) = tổng mẫu mẹ được cấp - tổng "MM đã kiểm tra".
  const surplusOf = (inst: (typeof instructions)[number]) =>
    inst.inputMotherQuantity - inst.dailyRecords.reduce((s, r) => s + r.motherChecked, 0);

  const active = instructions.filter((i) => i.status === "ACTIVE" || i.status === "DRAFT");
  const ended = instructions.filter((i) => i.status === "ENDED");
  const done = instructions.filter((i) => i.status === "COMPLETED" || i.status === "CANCELLED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chỉ định cấy của tôi</h1>
        <p className="text-gray-500 text-sm mt-1">{active.length} đang thực hiện · {ended.length} đã kết thúc · {done.length} đã xong</p>
      </div>

      {active.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Đang thực hiện</h2>
          <div className="space-y-3">
            {active.map((inst) => (
              <Card key={inst.id} className="border-l-4 border-l-blue-500">
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-700">{inst.code}</span>
                        <Badge className={cayMoStatusBadge(inst).color}>
                          {cayMoStatusBadge(inst).label}
                        </Badge>
                      </div>
                      <p className="font-semibold text-gray-900">{inst.plantType.name}</p>
                      {mediumNames(inst).length > 0 && <p className="text-sm text-gray-500">Môi trường: {mediumNames(inst).join(", ")}</p>}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-2">
                        <span>Đầu vào: <strong>{inst.inputMotherQuantity.toLocaleString("vi-VN")}</strong> mẫu mẹ</span>
                        {inst.expectedMotherOutput && (
                          <span>Dự kiến MM: <strong>{inst.expectedMotherOutput.toLocaleString("vi-VN")}</strong></span>
                        )}
                        <span>Nhật ký: <strong>{inst._count.dailyRecords}</strong></span>
                        <span>Lô: <strong>{inst._count.lots}</strong></span>
                      </div>
                      {inst.weekStart && (
                        <p className="text-xs text-gray-400">Tuần: {format(inst.weekStart, "dd/MM/yyyy", { locale: vi })}</p>
                      )}
                      {inst.motherReceivedAt && (
                        <p className="text-xs text-emerald-600 font-medium">
                          Đã nhận mẫu mẹ lúc {format(inst.motherReceivedAt, "HH:mm dd/MM/yyyy", { locale: vi })}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Link href={`/instructions/${inst.id}`}>
                        <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1" /> Xem</Button>
                      </Link>
                      {inst.status === "ACTIVE" && inst.handedOverAt && !inst.motherReceivedAt && (
                        <ConfirmMotherReceivedButton instructionId={inst.id} />
                      )}
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
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Đã kết thúc</h2>
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
                          <span className="font-mono font-bold text-blue-700">{inst.code}</span>
                          <Badge className={STATUS_COLORS.ENDED}>Kết thúc</Badge>
                        </div>
                        <p className="font-semibold text-gray-900">{inst.plantType.name}</p>
                        <p className="text-sm text-gray-500">
                          Lý do: {inst.endReason ? END_REASON_LABELS[inst.endReason] : "—"}
                        </p>
                        {inst.endReason === "TIME_UP" && (
                          <p className="text-sm text-gray-600">
                            MM dư: <strong>{Math.max(0, surplus).toLocaleString("vi-VN")}</strong>
                            {inst.surplusHandedOverAt && (
                              <span className="text-emerald-600 ml-2">
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
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Đã hoàn thành / Hủy</h2>
          <div className="space-y-2">
            {done.map((inst) => (
              <Card key={inst.id} className="opacity-70">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-gray-500">{inst.code}</span>
                      <span className="font-medium text-gray-700">{inst.plantType.name}</span>
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
        <Card><CardContent className="py-16 text-center text-gray-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Chưa có chỉ định cấy nào được giao cho bạn</p>
        </CardContent></Card>
      )}
    </div>
  );
}
