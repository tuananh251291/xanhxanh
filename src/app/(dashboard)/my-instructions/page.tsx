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
import { isPageAllowed } from "@/lib/permissions";
import InstructionViewButton from "./instruction-view-button";
import SurplusHandoverButton from "./surplus-handover-button";
import DoneInstructionsTable from "./done-instructions-table";

const END_REASON_LABELS: Record<string, string> = {
  TIME_UP: "Hết thời gian (qua Chủ nhật)",
  MOTHER_USED_UP: "Đã dùng hết mẫu mẹ được cấp",
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
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-info-foreground">Chỉ định cấy đang thực hiện</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã chỉ định</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây / Tên cây</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Thời gian cấy</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Trạng thái</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Ghi chú</th>
                      <th className="px-4 py-3 font-bold text-base">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((inst) => (
                      <tr key={inst.id} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-3 font-mono font-medium text-info-foreground">{inst.code}</td>
                        <td className="px-4 py-3 text-foreground">
                          <span className="font-mono">{inst.plantType.code}</span> — {inst.plantType.name}
                        </td>
                        <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                          {inst.weekStart ? (
                            <>Từ <strong>{format(inst.weekStart, "dd/MM/yyyy", { locale: vi })}</strong> đến <strong>{format(addDays(inst.weekStart, 6), "dd/MM/yyyy", { locale: vi })}</strong></>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cayMoStatusBadge(inst).color}>{cayMoStatusBadge(inst).label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-primary-strong font-medium">
                          {inst.motherReceivedAt && <>Đã nhận mẫu mẹ lúc {format(inst.motherReceivedAt, "HH:mm dd/MM/yyyy", { locale: vi })}</>}
                        </td>
                        <td className="px-4 py-3">
                          {/* Không xét inst.status ở đây — cùng logic với cayMoStatusBadge() phía trên, chỉ dựa vào
                              handedOverAt/motherReceivedAt để tránh trường hợp chỉ định vẫn còn status DRAFT
                              (chưa được kích hoạt) nhưng đã bàn giao thật, khiến nút bị ẩn oan. */}
                          <InstructionViewButton instructionId={inst.id} needsConfirm={!!inst.handedOverAt && !inst.motherReceivedAt} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {ended.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Đã kết thúc</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã chỉ định</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Lý do kết thúc</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">MM dư</th>
                      <th className="px-4 py-3 font-bold text-base">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ended.map((inst) => {
                      const surplus = surplusOf(inst);
                      const canHandoverSurplus = inst.endReason === "TIME_UP" && !inst.surplusHandedOverAt && surplus > 0;
                      return (
                        <tr key={inst.id} className="border-b last:border-0 even:bg-primary-light/30">
                          <td className="px-4 py-3 font-mono font-medium text-info-foreground">{inst.code}</td>
                          <td className="px-4 py-3 text-foreground">{inst.plantType.name}</td>
                          <td className="px-4 py-3 text-text-secondary">
                            {inst.endReason ? END_REASON_LABELS[inst.endReason] : "—"}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {inst.endReason === "TIME_UP" ? (
                              <>
                                <strong>{Math.max(0, surplus).toLocaleString("vi-VN")}</strong>
                                {inst.surplusHandedOverAt && (
                                  <span className="text-primary-strong ml-2 text-xs">
                                    Đã bàn giao lúc {format(inst.surplusHandedOverAt, "HH:mm dd/MM/yyyy", { locale: vi })}
                                  </span>
                                )}
                              </>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Link href={`/instructions/${inst.id}`}>
                                <Button size="sm"><Eye className="w-4 h-4 mr-1" /> Xem</Button>
                              </Link>
                              {canHandoverSurplus && <SurplusHandoverButton instructionId={inst.id} surplus={surplus} />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-text-secondary">Chỉ định cấy đã hoàn thành/Hủy</h2>
          <DoneInstructionsTable instructions={done} />
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
