"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sprout, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import TrialRoundResultDialog, { type DueTrialRound } from "@/components/shared/trial-round-result-dialog";

// Tab "Cập nhật tiến độ sản xuất" (R&D, /rnd) — gợi ý nhiệm vụ: mọi lượt cấy giống thử nghiệm sắp/đã đến
// hạn cấy (trong vòng 3 ngày tới, xem GET /api/trial-varieties/due-rounds) mà chưa nhập kết quả. Vào chi
// tiết từng giống (/rnd/[id]) để xem lịch sử đầy đủ hoặc bắt đầu lượt cấy mới. Cùng nguồn dữ liệu + dialog
// với thẻ nhiệm vụ ở Dashboard Admin kỹ thuật.
export default function ProductionProgressTracker() {
  const [rounds, setRounds] = useState<DueTrialRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRound, setActiveRound] = useState<DueTrialRound | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trial-varieties/due-rounds");
      const data = await res.json();
      setRounds(Array.isArray(data.rounds) ? data.rounds : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cập nhật tiến độ sản xuất</CardTitle>
        <p className="text-sm text-text-secondary mt-1">
          Nhiệm vụ — các lượt cấy giống thử nghiệm sắp/đã đến hạn cấy (trong 3 ngày tới), cần nhập số liệu.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : rounds.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">Không có giống nào sắp đến tuổi cấy</p>
        ) : (
          <div className="space-y-2">
            {rounds.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-warning-light bg-warning-light/40 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="bg-warning-light p-2 rounded-lg shrink-0">
                    <Sprout className="w-4 h-4 text-warning-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Là giống <Link href={`/rnd/${r.trialVariety.id}`} className="text-info-foreground underline underline-offset-2">{r.trialVariety.name} ({r.trialVariety.code})</Link> — đến hạn cấy {format(new Date(r.expectedReadyAt), "dd/MM/yyyy", { locale: vi })}
                    </p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Cấy ngày {format(new Date(r.plantedAt), "dd/MM/yyyy", { locale: vi })} — chờ {r.waitWeeks} tuần
                      {" "}(mẫu mẹ đưa vào: {r.motherInputQuantity.toLocaleString("vi-VN")})
                    </p>
                  </div>
                </div>
                <Button type="button" size="sm" className="bg-primary hover:bg-primary-hover shrink-0" onClick={() => setActiveRound(r)}>
                  <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Cập nhật dữ liệu cấy
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {activeRound && (
        <TrialRoundResultDialog
          round={activeRound}
          open={!!activeRound}
          onOpenChange={(o) => { if (!o) setActiveRound(null); }}
          onRecorded={load}
        />
      )}
    </Card>
  );
}
