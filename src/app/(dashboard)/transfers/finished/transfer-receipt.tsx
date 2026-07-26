"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { PrintButton } from "@/components/shared/print-button";
import { aggregateLotsByPlantType } from "@/lib/transfer-aggregate";
import type { CreatedTransfer } from "./types";

const PENDING_LABEL = { label: "Đã bàn giao / Chưa xác nhận", color: "bg-warning-light text-warning-foreground" };

// Phiếu bàn giao thành phẩm in được — dùng chung cho cả luồng tạo phiếu inline (transfer-finished-form.tsx)
// lẫn luồng xem trước & bàn giao sớm theo Nhóm tuần ra rễ (review/review-transfer-form.tsx).
export default function TransferReceipt({
  transfer, staffName, onCreateNew,
}: {
  transfer: CreatedTransfer;
  staffName: string;
  onCreateNew: () => void;
}) {
  const slipLots = transfer.shelves.flatMap((s) => s.lots);
  const slipAggregated = aggregateLotsByPlantType(slipLots);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="border rounded-lg bg-white p-6 print:border-none">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">PHIẾU BÀN GIAO THÀNH PHẨM</h1>
            <p className="font-mono text-info-foreground mt-1">{transfer.code}</p>
          </div>
          <Badge className={PENDING_LABEL.color}>{PENDING_LABEL.label}</Badge>
        </div>
        <p className="text-sm text-text-secondary">Người bàn giao: <strong>{staffName}</strong></p>
        <p className="text-sm text-text-secondary">Thời gian: {format(new Date(transfer.transferredAt), "dd/MM/yyyy HH:mm", { locale: vi })}</p>
        <p className="text-sm text-text-secondary mb-3">
          Giàn kệ: {transfer.shelves.map((s) => s.code).join(", ")}
        </p>

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
            {slipAggregated.map((row) => (
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
            <p className="font-medium">{staffName}</p>
          </div>
          <div>
            <p className="font-medium">NGƯỜI NHẬN (KHO THÀNH PHẨM)</p>
            <p className="text-xs text-text-secondary italic">(Ký và ghi rõ họ tên)</p>
            <div className="h-20" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 print:hidden">
        <Button variant="outline" className="flex-1" onClick={onCreateNew}>
          <PlusCircle className="w-4 h-4 mr-2" /> Tạo phiếu mới
        </Button>
        <PrintButton />
      </div>
    </div>
  );
}
