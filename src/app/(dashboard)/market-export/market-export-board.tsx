"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Loader2, History } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import ExcelImportCard from "@/components/shared/excel-import-card";

type MarketExportSummary = {
  id: string;
  code: string;
  fileName: string | null;
  createdAt: string;
  createdBy: { name: string; code: string };
  itemCount: number;
  totalQuantity: number;
  totalDeducted: number;
};

export default function MarketExportBoard() {
  const [history, setHistory] = useState<MarketExportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/market-export");
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Send className="w-6 h-6 text-primary-strong" />
          Xuất cây
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tải file Excel xuất từ sàn bán hàng — hệ thống tự trừ tồn thực theo từng dòng (Mã đơn/Tình trạng/Ngày/Lineitem quantity/Tên SPF/Mã hàng/Tên nội bộ).
        </p>
      </div>

      <ExcelImportCard
        icon={<Send className="w-5 h-5" />}
        title="Nhập file xuất cây"
        description="Mỗi dòng trừ tồn thực đúng Loại cây + quy cách (túi → Phòng sản phẩm đạt, chậu → Phòng cây trồng). Dòng trùng Mã đơn + Mã hàng với lần tải trước sẽ tự bỏ qua."
        templateUrl="/api/market-export/template"
        uploadUrl="/api/market-export"
        successLabel={(count) => `Đã ghi nhận xuất ${count} dòng`}
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <History className="w-4 h-4 text-text-secondary" />
            <h2 className="font-bold text-base text-primary-strong">Lịch sử đã tải lên</h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-text-muted text-sm">Chưa có lần xuất cây nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã phiếu</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Người tải</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">File</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số dòng</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tổng số lượng</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số cây đã trừ</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-text-secondary">
                        {h.code}
                        <div className="text-xs text-text-muted font-sans">{format(new Date(h.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}</div>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {h.createdBy.name} <span className="text-xs text-text-muted font-mono">({h.createdBy.code})</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary truncate max-w-[200px]">{h.fileName ?? "—"}</td>
                      <td className="px-4 py-3 text-right">{h.itemCount.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-right">{h.totalQuantity.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-right font-medium text-primary-strong">{h.totalDeducted.toLocaleString("vi-VN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
