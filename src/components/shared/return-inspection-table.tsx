"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  const [nhiem, setNhiem] = useState("");
  const [khongDat, setKhongDat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const nhiemQty = Number(nhiem) || 0;
  const khongDatQty = Number(khongDat) || 0;
  const total = nhiemQty + khongDatQty;
  const overLimit = total > item.quantityPassed;

  const submit = async () => {
    if (overLimit) { toast.error("Tổng số lượng trả hàng không được lớn hơn số lượng đạt lúc nhập"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/goods-receipt-items/${item.id}/return`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnQuantityNhiem: nhiemQty, returnQuantityKhongDat: khongDatQty }),
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
      <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.plantName}</td>
      <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.stageCode}</td>
      <td className="px-3 py-2 text-sm text-right font-medium tabular-nums whitespace-nowrap">{item.quantityPassed.toLocaleString("vi-VN")}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Badge variant={item.overdue ? "overdue" : "in-progress"}>{item.deadlineLabel}</Badge>
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          min={0}
          className="h-8 w-20 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={nhiem}
          disabled={submitting}
          onChange={(e) => setNhiem(e.target.value)}
          placeholder="0"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          min={0}
          className="h-8 w-20 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={khongDat}
          disabled={submitting}
          onChange={(e) => setKhongDat(e.target.value)}
          placeholder="0"
        />
      </td>
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
// cây trong 1 phiếu nhập) đang chờ kiểm tra (returnedAt = null). "Tổng trả" tính LIVE từ 2 ô Nhiễm/Không
// đạt tiêu chuẩn đang gõ, chưa lưu gì cho tới khi bấm "Xác nhận gửi trả NCC" — khác OrderPickTable (không
// tự lưu khi rời ô) vì đây là thao tác MỘT LẦN duy nhất (item biến mất khỏi bảng ngay sau khi xác nhận).
export default function ReturnInspectionTable({ items }: { items: ReturnInspectionItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">Không có dòng nào cần kiểm tra trả hàng</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light text-left text-primary-strong">
            <th className="px-3 py-2 font-bold text-base">Phiếu · NCC</th>
            <th className="px-3 py-2 font-bold text-base">Mã cây</th>
            <th className="px-3 py-2 font-bold text-base">Tên cây</th>
            <th className="px-3 py-2 font-bold text-base">Quy cách</th>
            <th className="px-3 py-2 font-bold text-base text-right">SL đạt lúc nhập</th>
            <th className="px-3 py-2 font-bold text-base">Hạn kiểm tra</th>
            <th className="px-3 py-2 font-bold text-base">Nhiễm</th>
            <th className="px-3 py-2 font-bold text-base">Không đạt tiêu chuẩn</th>
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
  );
}
