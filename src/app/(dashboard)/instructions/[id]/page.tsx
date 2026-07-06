import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format, addDays } from "date-fns";
import { vi } from "date-fns/locale";
import { INSTRUCTION_STATUS_LABELS, STAGE_LABELS, ROLE_LABELS, MEDIUM_ORDER_STATUS_LABELS } from "@/types";
import type { InstructionStatus } from "@prisma/client";
import { PrintButton } from "@/components/shared/print-button";
import { isPageAllowed } from "@/lib/permissions";

const STATUS_COLORS: Record<InstructionStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
  ENDED: "bg-slate-200 text-slate-700",
};

export default async function InstructionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/instructions"))) redirect("/dashboard");

  const { id } = await params;

  const inst = await prisma.plantingInstruction.findUnique({
    where: { id },
    include: {
      plantType: { include: { category: true } },
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true, code: true } },
      items: {
        include: {
          shelf: { include: { warehouse: { select: { name: true } } } },
          motherMedium: { select: { code: true, name: true } },
          finishedMedium: { select: { code: true, name: true } },
        },
      },
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
      mediumOrder: { select: { id: true, code: true, confirmedAt: true } },
    },
  });

  if (!inst) notFound();

  // Permission: CAY_MO can only see their own
  if (role === "CAY_MO" && inst.assignedToId !== session!.user.id) redirect("/my-instructions");

  // Dữ liệu riêng cho "Phiếu chỉ định sản xuất"
  const weekEnd = inst.weekStart ? addDays(inst.weekStart, 6) : null;
  const yearYY = format(inst.weekStart ?? inst.createdAt, "yy");
  const printRows = inst.items.map((item) => ({
    id: item.id,
    maMauMe: `${inst.plantType.category.code}${yearYY}${item.stageCode ?? ""}`,
    slSach: item.quantity,
  }));
  const m03Total = inst.items.filter((i) => i.stageCode === "M03").reduce((s, i) => s + (i.expectedMotherOutput ?? 0), 0);
  const m05Total = inst.items.filter((i) => i.stageCode === "M05").reduce((s, i) => s + (i.expectedMotherOutput ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Phiếu chỉ định sản xuất — hiển thị luôn trên màn hình, giữ nguyên khi in */}
      <div className="text-sm border rounded-lg bg-white p-4 print:border-none print:p-0 print:rounded-none">
        <div className="flex items-start justify-between">
          <p className="text-xs">
            <strong>MM</strong>: Mẫu mẹ &nbsp;&nbsp; <strong>NV</strong>: Nhân viên
            <br />
            <strong>SL</strong>: Số lượng
          </p>
          <h1 className="text-xl font-bold">PHIẾU CHỈ ĐỊNH SẢN XUẤT</h1>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full border-collapse mt-3 min-w-[480px]">
          <tbody>
            <tr>
              <td className="border px-2 py-1 w-24">Từ ngày:</td>
              <td className="border px-2 py-1">{inst.weekStart ? format(inst.weekStart, "d/M/yy") : "—"}</td>
              <td className="border px-2 py-1 w-24">đến ngày:</td>
              <td className="border px-2 py-1">{weekEnd ? format(weekEnd, "d/M/yy") : "—"}</td>
            </tr>
            <tr>
              <td className="border px-2 py-1" colSpan={4}>Ngày nhận mẫu mẹ: ................./.................</td>
            </tr>
            <tr>
              <td className="border px-2 py-1" colSpan={2}>Họ và tên bên giao: {session!.user.name}</td>
              <td className="border px-2 py-1" colSpan={2}>Vị trí: {role ? ROLE_LABELS[role] : "—"}</td>
            </tr>
            <tr>
              <td className="border px-2 py-1" colSpan={2}>Họ và tên bên nhận: {inst.assignedTo?.name ?? "………………"}</td>
              <td className="border px-2 py-1" colSpan={2}>Mã NV: {inst.assignedTo?.code ?? "………………"}</td>
            </tr>
          </tbody>
        </table>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full border-collapse mt-3 min-w-[520px] text-center">
          <thead>
            <tr>
              <th className="border px-2 py-1">Mã mẫu mẹ</th>
              <th className="border px-2 py-1">SL MM<br />bàn giao</th>
              <th className="border px-2 py-1">Mã NV sản xuất<br />MM đầu vào</th>
              <th className="border px-2 py-1">SL MM<br />nhiễm</th>
              <th className="border px-2 py-1">SL MM<br />sạch</th>
            </tr>
          </thead>
          <tbody>
            {printRows.map((r) => (
              <tr key={r.id}>
                <td className="border px-2 py-1 font-mono">{r.maMauMe}</td>
                <td className="border px-2 py-1">&nbsp;</td>
                <td className="border px-2 py-1">&nbsp;</td>
                <td className="border px-2 py-1">&nbsp;</td>
                <td className="border px-2 py-1 bg-yellow-200 font-medium">{r.slSach.toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full border-collapse mt-3 min-w-[480px]">
          <tbody>
            <tr>
              <td className="border px-2 py-2 align-top w-32 font-medium">*Chỉ định cấy:</td>
              <td className="border px-2 py-2 whitespace-pre-line" colSpan={4}>{inst.notes || " "}</td>
            </tr>
            <tr>
              <td className="border px-2 py-1 font-medium">Quy cách (Túi)</td>
              <td className="border px-2 py-1 text-center">SL túi M03</td>
              <td className="border px-2 py-1 text-center">SL túi M05</td>
              <td className="border px-2 py-1 text-center">SL túi T01</td>
              <td className="border px-2 py-1 text-center">SL túi T05</td>
            </tr>
            <tr>
              <td className="border px-2 py-1 font-medium">SL dự kiến trả:</td>
              <td className="border px-2 py-1 text-center font-bold">{m03Total.toLocaleString("vi-VN")}</td>
              <td className="border px-2 py-1 text-center font-bold">{m05Total.toLocaleString("vi-VN")}</td>
              <td className="border px-2 py-1 text-center font-bold">{(inst.plannedT01Quantity ?? 0).toLocaleString("vi-VN")}</td>
              <td className="border px-2 py-1 text-center font-bold">{(inst.plannedT05Quantity ?? 0).toLocaleString("vi-VN")}</td>
            </tr>
          </tbody>
        </table>
        </div>
        <p className="text-xs italic mt-1">
          Lưu ý: Nếu số lượng sản phẩm cấy ra không đạt như chỉ định cấy báo cáo ngay cho quản lý trực tiếp để được hỗ trợ xử lý kịp thời trong ngày
        </p>

        <div className="grid grid-cols-1 gap-8 mt-8 text-center sm:grid-cols-2">
          <div>
            <p className="font-medium">Bên giao</p>
            <p className="text-xs mb-14">(Kí và ghi rõ họ tên)</p>
          </div>
          <div>
            <p className="font-medium">Bên nhận</p>
            <p className="text-xs mb-14">(Kí và ghi rõ họ tên)</p>
          </div>
        </div>
        <p className="text-xs mt-1">*Tôi xác nhận đã nhận đủ số lượng và hiểu rõ chỉ định cấy.</p>
      </div>

      <div className="flex items-center gap-3 print:hidden">
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
        {inst.mediumOrder && (
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
        <Card className="print:hidden">
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

    </div>
  );
}
