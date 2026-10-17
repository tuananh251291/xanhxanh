"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { QUALITY_DEFECT_COUNT } from "@/lib/quality-defects";
import QualityDefectLegend from "./quality-defect-legend";

export type ReturnInspectionItem = {
  id: string;
  receiptCode: string;
  supplierName: string;
  plantCode: string;
  plantName: string;
  stageCode: string;
  quantityPassed: number;
  deadlineLabel: string;
  overdue: boolean;
};

function ReturnInspectionRow({ item }: { item: ReturnInspectionItem }) {
  // [Lỗi 1..Lỗi 5] — xem QUALITY_DEFECT_LABELS (src/lib/quality-defects.ts).
  const [defects, setDefects] = useState<string[]>(() => Array.from({ length: QUALITY_DEFECT_COUNT }, () => ""));
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const defectQtys = defects.map((d) => Math.max(0, parseInt(d, 10) || 0));
  const total = defectQtys.reduce((s, n) => s + n, 0);
  const overLimit = total > item.quantityPassed;

  const submit = async () => {
    if (overLimit) { toast.error("Tổng số lượng trả hàng không được lớn hơn số lượng đạt lúc nhập"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/goods-receipt-items/${item.id}/return`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defectQuantities: defectQtys }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(total > 0 ? `Đã gửi trả ${total.toLocaleString("vi-VN")} cây cho nhà cung cấp` : "Đã kiểm tra — không phát hiện thêm lỗi");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <tr className="border-b last:border-0 even:bg-primary-light/30">
      <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">
        <span className="font-mono">{item.receiptCode}</span> · {item.supplierName}
      </td>
      <td className="px-3 py-2 text-sm font-mono text-text-secondary whitespace-nowrap">{item.plantCode}</td>
      <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.stageCode}</td>
      <td className="px-3 py-2 text-sm text-right font-medium tabular-nums whitespace-nowrap">{item.quantityPassed.toLocaleString("vi-VN")}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Badge variant={item.overdue ? "overdue" : "in-progress"}>{item.deadlineLabel}</Badge>
      </td>
      {defects.map((value, i) => (
        <td key={i} className="px-2 py-2">
          <Input
            type="number"
            min={0}
            className="h-8 w-16 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={value}
            disabled={submitting}
            onChange={(e) => setDefects((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
            placeholder="0"
          />
        </td>
      ))}
      <td className={`px-3 py-2 text-sm text-right font-semibold tabular-nums whitespace-nowrap ${overLimit ? "text-destructive" : "text-foreground"}`}>
        {total.toLocaleString("vi-VN")}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Button type="button" size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={submitting || overLimit} onClick={submit}>
          {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5 mr-1.5" />}
          Xác nhận gửi trả NCC
        </Button>
      </td>
    </tr>
  );
}

// Bảng "Trả hàng nhà cung cấp" dùng chung ở /goods-receipts (NV kho thành phẩm thao tác) và
// /task-assignment (Quản lý kho thành phẩm theo dõi/thao tác hộ) — mỗi hàng là 1 GoodsReceiptItem (1 mã
// cây trong 1 phiếu nhập) đang chờ kiểm tra (returnedAt = null). "Tổng trả" tính LIVE từ 5 ô Lỗi 1..Lỗi 5
// đang gõ, chưa lưu gì cho tới khi bấm "Xác nhận gửi trả NCC" — khác OrderPickTable (không
// tự lưu khi rời ô) vì đây là thao tác MỘT LẦN duy nhất (item biến mất khỏi bảng ngay sau khi xác nhận).
export default function ReturnInspectionTable({ items }: { items: ReturnInspectionItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">Không có dòng nào cần kiểm tra trả hàng</p>;
  }
  return (
    <div className="space-y-2">
    <QualityDefectLegend />
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light text-left text-primary-strong">
            <th className="px-3 py-2 font-bold text-base">Phiếu · NCC</th>
            <th className="px-3 py-2 font-bold text-base">Mã cây</th>
            <th className="px-3 py-2 font-bold text-base">Quy cách</th>
            <th className="px-3 py-2 font-bold text-base text-right">SL đạt lúc nhập</th>
            <th className="px-3 py-2 font-bold text-base">Hạn kiểm tra</th>
            {Array.from({ length: QUALITY_DEFECT_COUNT }, (_, i) => (
              <th key={i} className="px-2 py-2 font-bold text-base whitespace-nowrap">Lỗi {i + 1}</th>
            ))}
            <th className="px-3 py-2 font-bold text-base text-right">Tổng trả</th>
            <th className="px-3 py-2 font-bold text-base"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ReturnInspectionRow key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
