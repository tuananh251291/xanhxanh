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

const STATUS_COLORS: Record<InstructionStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
};

export default async function MyInstructionsPage() {
  const session = await auth();
  if (!session?.user || !(await isPageAllowed(session.user.role, "/my-instructions"))) redirect("/dashboard");

  const instructions = await prisma.plantingInstruction.findMany({
    where: { assignedToId: session.user.id },
    include: {
      plantType: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      items: {
        include: {
          motherMedium: { select: { name: true } },
          finishedMedium: { select: { name: true } },
        },
      },
      _count: { select: { dailyRecords: true, lots: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const mediumNames = (inst: (typeof instructions)[number]) =>
    Array.from(new Set(inst.items.flatMap((i) => [i.motherMedium?.name, i.finishedMedium?.name]).filter((n): n is string => !!n)));

  const active = instructions.filter((i) => i.status === "ACTIVE" || i.status === "DRAFT");
  const done = instructions.filter((i) => i.status === "COMPLETED" || i.status === "CANCELLED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chỉ định cấy của tôi</h1>
        <p className="text-gray-500 text-sm mt-1">{active.length} đang thực hiện · {done.length} đã xong</p>
      </div>

      {active.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Đang thực hiện</h2>
          <div className="space-y-3">
            {active.map((inst) => (
              <Card key={inst.id} className="border-l-4 border-l-blue-500">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-700">{inst.code}</span>
                        <Badge className={STATUS_COLORS[inst.status as InstructionStatus]}>
                          {INSTRUCTION_STATUS_LABELS[inst.status as InstructionStatus]}
                        </Badge>
                      </div>
                      <p className="font-semibold text-gray-900">{inst.plantType.name}</p>
                      {mediumNames(inst).length > 0 && <p className="text-sm text-gray-500">Môi trường: {mediumNames(inst).join(", ")}</p>}
                      <div className="flex gap-4 text-sm text-gray-600 mt-2">
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
                    </div>
                    <Link href={`/instructions/${inst.id}`}>
                      <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1" /> Xem</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
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
