import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { isPageAllowed } from "@/lib/permissions";
import { PrintButton } from "@/components/shared/print-button";
import type { TransferStatus } from "@prisma/client";

const STATUS_LABELS: Record<TransferStatus, { label: string; color: string }> = {
  PENDING: { label: "Đã bàn giao / Chưa xác nhận", color: "bg-warning-light text-warning-foreground" },
  CONFIRMED: { label: "Bàn giao thành công", color: "bg-primary-light text-primary-strong" },
  REJECTED: { label: "Bị từ chối", color: "bg-danger-light text-destructive" },
};

export default async function TransferFinishedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/transfers/finished"))) redirect("/dashboard");

  const { id } = await params;
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      fromUser: { select: { name: true } },
      items: { include: { lot: { include: { plantType: { select: { code: true, name: true } } } } } },
    },
  });
  if (!transfer) notFound();

  // Giàn kệ nguồn được ghi lại vào notes lúc tạo phiếu (xem transfer-finished-form.tsx) — không đọc
  // trực tiếp từ lot.shelf vì sau khi Kho thành phẩm xác nhận, lô đã chuyển sang kệ đích khác.
  const shelvesLine = transfer.notes ?? "—";

  const aggregated = new Map<string, { code: string; name: string; t01: number; t05: number }>();
  for (const item of transfer.items) {
    const existing = aggregated.get(item.lot.plantTypeId) ?? { code: item.lot.plantType.code, name: item.lot.plantType.name, t01: 0, t05: 0 };
    if (item.lot.stageCode === "T01") existing.t01 += item.quantity;
    else if (item.lot.stageCode === "T05") existing.t05 += item.quantity;
    aggregated.set(item.lot.plantTypeId, existing);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 print:hidden">
        <Link href="/transfers/finished/list"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
      </div>

      <div className="border rounded-lg bg-white p-6 print:border-none">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">PHIẾU BÀN GIAO THÀNH PHẨM</h1>
            <p className="font-mono text-info-foreground mt-1">{transfer.code}</p>
          </div>
          <Badge className={STATUS_LABELS[transfer.status].color}>{STATUS_LABELS[transfer.status].label}</Badge>
        </div>
        <p className="text-sm text-text-secondary">Người bàn giao: <strong>{transfer.fromUser.name}</strong></p>
        <p className="text-sm text-text-secondary">Thời gian: {format(transfer.transferredAt, "dd/MM/yyyy HH:mm", { locale: vi })}</p>
        <p className="text-sm text-text-secondary mb-3">{shelvesLine}</p>

        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[420px]">
          <thead>
            <tr>
              <th className="border px-3 py-2 text-left font-bold text-base">Mã cây</th>
              <th className="border px-3 py-2 text-left font-bold text-base">Loại cây</th>
              <th className="border px-3 py-2 text-right font-bold text-base">T01</th>
              <th className="border px-3 py-2 text-right font-bold text-base">T05</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(aggregated.values()).map((row) => (
              <tr key={row.code}>
                <td className="border px-3 py-2 font-mono">{row.code}</td>
                <td className="border px-3 py-2">{row.name}</td>
                <td className="border px-3 py-2 text-right font-medium">{row.t01.toLocaleString("vi-VN")}</td>
                <td className="border px-3 py-2 text-right font-medium">{row.t05.toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="grid grid-cols-1 gap-6 mt-10 pt-4 text-sm text-center sm:grid-cols-2">
          <div>
            <p className="font-medium">NGƯỜI GIAO (KHO MÔ)</p>
            <p className="text-xs text-text-secondary italic">(Ký và ghi rõ họ tên)</p>
            <div className="h-20" />
            <p className="font-medium">{transfer.fromUser.name}</p>
          </div>
          <div>
            <p className="font-medium">NGƯỜI NHẬN (KHO THÀNH PHẨM)</p>
            <p className="text-xs text-text-secondary italic">(Ký và ghi rõ họ tên)</p>
            <div className="h-20" />
          </div>
        </div>
      </div>

      <div className="print:hidden">
        <PrintButton />
      </div>
    </div>
  );
}
