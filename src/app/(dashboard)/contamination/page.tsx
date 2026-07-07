"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type ContaminationRecord = {
  id: string;
  quantity: number;
  recordDate: string;
  confirmedAt: string | null;
  notes: string | null;
  lot: {
    code: string;
    stage: "MAU_ME" | "THANH_PHAM";
    quantity: number;
    initialQuantity: number;
    plantType: { name: string; code: string };
    shelf: { name: string; warehouse: { name: string } } | null;
    instruction: { code: string } | null;
  };
};

export default function ContaminationPage() {
  const [records, setRecords] = useState<ContaminationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contamination?confirmed=false");
      if (res.ok) setRecords(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirm = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch("/api/contamination", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhiễm — trừ tồn kho lô");
      load();
    } finally { setProcessing(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" /> Lọc nhiễm
        </h1>
        <p className="text-text-secondary text-sm mt-1">{records.length} báo cáo nhiễm chờ xác nhận</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : records.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có báo cáo nhiễm nào đang chờ</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const rate = r.lot.initialQuantity > 0 ? r.quantity / r.lot.initialQuantity : 0;
            return (
              <Card key={r.id} className="border-l-4 border-l-red-400">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-info-foreground">{r.lot.code}</span>
                        <Badge variant="secondary" className="text-xs">{r.lot.stage === "MAU_ME" ? "Mẫu mẹ" : "Thành phẩm"}</Badge>
                        {rate > 0.2 && <Badge className="bg-danger-light text-destructive text-xs">⚠️ {Math.round(rate * 100)}%</Badge>}
                      </div>
                      <p className="text-sm text-foreground">{r.lot.plantType.name}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
                        <span>Số lượng báo nhiễm: <strong className="text-destructive">{r.quantity.toLocaleString("vi-VN")}</strong></span>
                        <span>Tồn hiện tại: {r.lot.quantity.toLocaleString("vi-VN")}</span>
                        {r.lot.shelf && <span>Kệ: {r.lot.shelf.name} ({r.lot.shelf.warehouse.name})</span>}
                        {r.lot.instruction && <span>Chỉ định: {r.lot.instruction.code}</span>}
                      </div>
                      <p className="text-xs text-text-muted">{format(new Date(r.recordDate), "dd/MM/yyyy HH:mm", { locale: vi })}</p>
                      {r.notes && <p className="text-xs text-text-secondary italic">&quot;{r.notes}&quot;</p>}
                    </div>
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary-hover"
                      onClick={() => confirm(r.id)}
                      disabled={processing === r.id}
                    >
                      {processing === r.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                      Xác nhận
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
