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
import { INSTRUCTION_STATUS_LABELS, isAdminRole } from "@/types";
import CreateInstructionDialog from "./create-instruction-dialog";
import type { InstructionStatus } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import AssignStaffCell from "./assign-staff-cell";

const STATUS_COLORS: Record<InstructionStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
};

export default async function InstructionsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/instructions"))) redirect("/dashboard");

  const where: Record<string, unknown> = {};
  if (role === "CAY_MO") where.assignedToId = session!.user.id;
  if (role === "KY_THUAT") where.createdById = session!.user.id;

  const [instructions, caymoStaff] = await Promise.all([
    prisma.plantingInstruction.findMany({
      where,
      include: {
        plantType: { select: { code: true, name: true } },
        createdBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
        _count: { select: { dailyRecords: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    role === "KHO_MO"
      ? prisma.user.findMany({ where: { role: "CAY_MO", isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chỉ định cấy</h1>
          <p className="text-gray-500 text-sm mt-1">{instructions.length} chỉ định</p>
        </div>
        {(isAdminRole(role) || role === "KY_THUAT") && <CreateInstructionDialog />}
      </div>

      {instructions.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Chưa có chỉ định cấy nào</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Mã chỉ định</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Loại cây</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">NV cấy</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Đầu vào</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Dự kiến output</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Nhật ký</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trạng thái</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Ngày tạo</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {instructions.map((inst) => (
                    <tr key={inst.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-blue-700">{inst.code}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="font-medium">{inst.plantType.name}</span>
                        <span className="text-gray-400 text-xs ml-1">({inst.plantType.code})</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {inst.assignedTo ? (
                          inst.assignedTo.name
                        ) : role === "KHO_MO" ? (
                          <AssignStaffCell instructionId={inst.id} staffList={caymoStaff} />
                        ) : (
                          <Badge variant="secondary">Chưa gán</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{inst.inputMotherQuantity.toLocaleString("vi-VN")} mẫu</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {inst.expectedMotherOutput ? `${inst.expectedMotherOutput.toLocaleString("vi-VN")} MM` : "—"}
                        {inst.expectedFinishedOutput ? ` / ${inst.expectedFinishedOutput.toLocaleString("vi-VN")} TP` : ""}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <Badge variant="secondary">{inst._count.dailyRecords}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_COLORS[inst.status as InstructionStatus]}>
                          {INSTRUCTION_STATUS_LABELS[inst.status as InstructionStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {format(inst.createdAt, "dd/MM/yyyy", { locale: vi })}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/instructions/${inst.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
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
  );
}
