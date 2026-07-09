"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PackageCheck, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Row = {
  transferId: string;
  code: string;
  transferredAt: string;
  staffCode: string;
  staffName: string;
  items: { lotCode: string; stageCode: string; quantity: number }[];
  totalQuantity: number;
};

type Placement = { lotCode: string; shelfCode: string; quantity: number; pool: "OWNED" | "SHARED" | "RA_RE" };

export default function ReceiveSurplusBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transfers/receive-phong-toi/surplus");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const confirm = async (transferId: string) => {
    setProcessing(transferId);
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      const placements: Placement[] = json.placements ?? [];
      const lines = placements.map((p) => `${p.lotCode} → ${p.shelfCode} (${p.quantity.toLocaleString("vi-VN")})`);
      toast.success("Đã xếp MM dư vào Kho quá hạn", { description: lines.join(" · ") });
      loadData();
    } finally {
      setProcessing(null);
    }
  };

  const reject = async (transferId: string) => {
    setProcessing(transferId);
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
      toast.success("Đã từ chối bàn giao");
      loadData();
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (rows.length === 0) {
    return (
      <Card><CardContent className="py-16 text-center text-text-muted">
        <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
        <p>Không có phiếu MM dư nào đang chờ</p>
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã phiếu</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên nhân viên</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã lô sản phẩm</th>
                <th className="text-left px-4 py-3 font-bold text-base">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.transferId} className="border-b last:border-0 even:bg-primary-light/30">
                  <td className="px-4 py-3 font-mono text-text-secondary">
                    {row.code}
                    <div className="text-xs text-text-muted font-sans">{format(new Date(row.transferredAt), "dd/MM/yyyy HH:mm", { locale: vi })}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-text-secondary">{row.staffCode}</td>
                  <td className="px-4 py-3 text-foreground">{row.staffName}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {[...new Set(row.items.map((item) => item.lotCode))].map((lotCode) => (
                        <Badge key={lotCode} variant="outline" className="font-mono text-[11px]">{lotCode}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-destructive"
                        disabled={processing === row.transferId}
                        onClick={() => reject(row.transferId)}
                      >
                        <X className="w-3.5 h-3.5 mr-1.5" /> Từ chối
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 bg-primary hover:bg-primary-hover"
                        disabled={processing === row.transferId}
                        onClick={() => confirm(row.transferId)}
                      >
                        {processing === row.transferId ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                        Xác nhận
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
