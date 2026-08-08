"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CONTAMINATION_ENTRY_REASON_LABELS } from "@/types";

type Entry = {
  id: string;
  quantity: number;
  sourceLotCode: string | null;
  reason: keyof typeof CONTAMINATION_ENTRY_REASON_LABELS;
  createdAt: string;
  reportedBy: { code: string; name: string };
};

// Phòng nhiễm chỉ lưu 1 lô GỘP theo (kho, mã cây, quy cách) — dialog này liệt kê từng lần cộng/trừ đã
// tạo nên tổng số đó (ai báo, từ lô nào, lúc nào, bao nhiêu) — xem ContaminationRoomEntry, gọi từ
// addToContaminationRoom/logContaminationRoomEntry (src/lib/contamination-room.ts).
export default function ContaminationEntriesDialog({ lotId, lotCode }: { lotId: string; lotCode: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contamination-room-entries?lotId=${lotId}`);
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !loaded) load();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="text-text-muted hover:text-primary-strong hover:bg-primary-light" title="Xem chi tiết từng lần báo nhiễm" />
        }
      >
        <History className="w-3.5 h-3.5" />
        <span className="sr-only">Xem chi tiết</span>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chi tiết từng lần báo nhiễm — {lotCode}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">Chưa có lịch sử — lô này có thể được tạo trước khi có tính năng ghi lịch sử.</p>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-primary-strong font-bold whitespace-nowrap">Thời gian</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold">Người báo</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold">Lý do</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold">Lô nguồn</th>
                  <th className="text-right px-3 py-2 text-primary-strong font-bold">Số lượng</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                    <td className="px-3 py-2 whitespace-nowrap text-text-secondary">
                      {format(new Date(e.createdAt), "HH:mm dd/MM/yyyy", { locale: vi })}
                    </td>
                    <td className="px-3 py-2">{e.reportedBy.name} <span className="text-text-muted font-mono text-xs">({e.reportedBy.code})</span></td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{CONTAMINATION_ENTRY_REASON_LABELS[e.reason] ?? e.reason}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-text-secondary">{e.sourceLotCode ?? "—"}</td>
                    <td className={`px-3 py-2 text-right font-medium ${e.quantity < 0 ? "text-success-foreground" : "text-destructive"}`}>
                      {e.quantity > 0 ? "+" : ""}{e.quantity.toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
