import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Calendar, User, Leaf, FlaskConical } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { INSTRUCTION_STATUS_LABELS, STAGE_LABELS, MOTHER_SPEC_LABELS, FINISHED_SPEC_LABELS } from "@/types";
import type { InstructionStatus } from "@prisma/client";
import { PrintButton } from "@/components/shared/print-button";
import { isPageAllowed } from "@/lib/permissions";

const STATUS_COLORS: Record<InstructionStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
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
      mediumType: true,
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      items: { include: { shelf: { include: { warehouse: { select: { name: true } } } } } },
      dailyRecords: {
        include: {
          staff: { select: { name: true } },
          items: { include: { lot: { select: { code: true, stage: true } } } },
        },
        orderBy: { recordDate: "desc" },
      },
      lots: {
        include: { shelf: { include: { warehouse: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!inst) notFound();

  // Permission: CAY_MO can only see their own
  if (role === "CAY_MO" && inst.assignedToId !== session!.user.id) redirect("/my-instructions");

  const totalMotherCreated = inst.lots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.initialQuantity, 0);
  const totalFinishedCreated = inst.lots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.initialQuantity, 0);

  return (
    <div className="space-y-6">
      {/* Print-only letterhead */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="text-xl font-bold">XANH XANH — PHIẾU CHỈ ĐỊNH CẤY</h1>
        <p className="text-sm">In lúc: {format(new Date(), "dd/MM/yyyy HH:mm", { locale: vi })}</p>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/instructions" className="print:hidden">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{inst.code}</h1>
          <p className="text-gray-500 text-sm">Chỉ định cấy</p>
        </div>
        <Badge className={STATUS_COLORS[inst.status as InstructionStatus]}>
          {INSTRUCTION_STATUS_LABELS[inst.status as InstructionStatus]}
        </Badge>
        <PrintButton />
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1"><Leaf className="w-4 h-4" /><span className="text-xs">Loại cây</span></div>
            <p className="font-semibold">{inst.plantType.name}</p>
            <p className="text-xs text-gray-400">{inst.plantType.code}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1"><User className="w-4 h-4" /><span className="text-xs">Nhân viên cấy</span></div>
            <p className="font-semibold">{inst.assignedTo?.name ?? "Chưa gán"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1"><FlaskConical className="w-4 h-4" /><span className="text-xs">Môi trường</span></div>
            <p className="font-semibold">{inst.mediumType?.name ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1"><Calendar className="w-4 h-4" /><span className="text-xs">Tuần thực hiện</span></div>
            <p className="font-semibold">{inst.weekStart ? format(inst.weekStart, "dd/MM/yyyy", { locale: vi }) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quantities */}
      <Card>
        <CardHeader><CardTitle className="text-base">Số lượng</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 text-sm">
            <div>
              <p className="text-gray-500">Mẫu mẹ đầu vào</p>
              <p className="text-xl font-bold text-blue-700">{inst.inputMotherQuantity.toLocaleString("vi-VN")}</p>
            </div>
            <div>
              <p className="text-gray-500">Mẫu mẹ dự kiến</p>
              <p className="text-xl font-bold text-purple-700">{inst.expectedMotherOutput?.toLocaleString("vi-VN") ?? "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">Mẫu mẹ thực tế</p>
              <p className="text-xl font-bold text-green-700">{totalMotherCreated.toLocaleString("vi-VN")}</p>
            </div>
            <div>
              <p className="text-gray-500">Thành phẩm thực tế</p>
              <p className="text-xl font-bold text-emerald-700">{totalFinishedCreated.toLocaleString("vi-VN")}</p>
              {inst.expectedFinishedOutput && (
                <p className="text-xs text-gray-400">dự kiến {inst.expectedFinishedOutput.toLocaleString("vi-VN")}</p>
              )}
            </div>
          </div>
          {(inst.plannedT01Quantity || inst.plannedT05Quantity) ? (
            <p className="mt-3 text-sm text-gray-500 border-t pt-3">
              Kế hoạch phân bổ: {FINISHED_SPEC_LABELS.T01} <strong>{(inst.plannedT01Quantity ?? 0).toLocaleString("vi-VN")}</strong>
              {" · "}{FINISHED_SPEC_LABELS.T05} <strong>{(inst.plannedT05Quantity ?? 0).toLocaleString("vi-VN")}</strong>
            </p>
          ) : null}
          {inst.notes && <p className="mt-3 text-sm text-gray-500 border-t pt-3">Ghi chú: {inst.notes}</p>}
        </CardContent>
      </Card>

      {/* Nguồn theo quy cách */}
      {inst.items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Quy cách nguồn</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Kệ</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Quy cách</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Số lượng dùng</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Tỉ lệ nhân MM / ra TP</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Dự kiến MM / TP</th>
                  </tr>
                </thead>
                <tbody>
                  {inst.items.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500">{item.shelf.name ?? item.shelf.code}</td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary">
                          {item.stageCode ? (MOTHER_SPEC_LABELS[item.stageCode as keyof typeof MOTHER_SPEC_LABELS] ?? item.stageCode) : "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 font-medium">{item.quantity.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-2 text-gray-500">×{item.motherSampleRatio ?? "—"} / ×{item.rootingRatio ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {item.expectedMotherOutput?.toLocaleString("vi-VN") ?? "—"} / {item.expectedFinishedOutput?.toLocaleString("vi-VN") ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lots */}
      {inst.lots.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Lô mô ({inst.lots.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Mã lô</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Giai đoạn</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Số lượng</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Kệ</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Nhập kho</th>
                  </tr>
                </thead>
                <tbody>
                  {inst.lots.map((lot) => (
                    <tr key={lot.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-blue-700">{lot.code}</td>
                      <td className="px-4 py-2"><Badge variant="secondary">{STAGE_LABELS[lot.stage]}</Badge></td>
                      <td className="px-4 py-2 font-medium">{lot.quantity.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-2 text-gray-500">{lot.shelf ? `${lot.shelf.warehouse.name} - ${lot.shelf.name ?? lot.shelf.code}` : "Chưa có kệ"}</td>
                      <td className="px-4 py-2 text-gray-500">{format(lot.enteredAt, "dd/MM/yyyy", { locale: vi })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Records */}
      {inst.dailyRecords.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nhật ký cấy ({inst.dailyRecords.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Ngày</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">NV</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Mẫu mẹ dùng</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {inst.dailyRecords.map((rec) => (
                    <tr key={rec.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{format(rec.recordDate, "dd/MM/yyyy", { locale: vi })}</td>
                      <td className="px-4 py-2">{rec.staff.name}</td>
                      <td className="px-4 py-2">{rec.motherUsed.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {rec.items.map((item) => `${STAGE_LABELS[item.stage]}: ${item.quantityCreated.toLocaleString("vi-VN")}`).join(" / ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Print-only signature block */}
      <div className="hidden print:grid grid-cols-2 gap-8 mt-10 text-center text-sm">
        <div>
          <p className="font-medium">Nhân viên kỹ thuật</p>
          <p className="text-xs text-gray-500 mb-16">(Ký, ghi rõ họ tên)</p>
          <p>{inst.createdBy.name}</p>
        </div>
        <div>
          <p className="font-medium">Nhân viên cấy mô</p>
          <p className="text-xs text-gray-500 mb-16">(Ký, ghi rõ họ tên)</p>
          <p>{inst.assignedTo?.name ?? "……………………"}</p>
        </div>
      </div>
    </div>
  );
}
