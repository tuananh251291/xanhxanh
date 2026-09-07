"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sprout, ClipboardCheck, History } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import TrialRoundResultDialog, { type DueTrialRound } from "@/components/shared/trial-round-result-dialog";

type VarietyRow = {
  id: string;
  code: string;
  name: string;
  plantGroup: string;
  roundCount: number;
  latestRound: { plantedAt: string; expectedReadyAt: string; recordedAt: string | null } | null;
};

// Tab "Cập nhật tiến độ sản xuất" (R&D, /rnd) — 2 phần:
// 1) Nhiệm vụ: mọi lượt cấy giống thử nghiệm sắp/đã đến hạn cấy (trong vòng 3 ngày tới, xem GET
//    /api/trial-varieties/due-rounds) mà chưa nhập kết quả.
// 2) Danh sách TOÀN BỘ giống thử nghiệm — bấm vào 1 giống để xem lịch sử cập nhật dữ liệu đầy đủ (theo
//    ngày cấy/đợt cấy, xem VarietyDetailBoard ở /rnd/[id]) hoặc bắt đầu lượt cấy mới, không chỉ giới hạn
//    ở các lượt sắp đến hạn như phần 1.
export default function ProductionProgressTracker() {
  const [rounds, setRounds] = useState<DueTrialRound[]>([]);
  const [varieties, setVarieties] = useState<VarietyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRound, setActiveRound] = useState<DueTrialRound | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dueRes, varietiesRes] = await Promise.all([
        fetch("/api/trial-varieties/due-rounds"),
        fetch("/api/trial-varieties"),
      ]);
      const dueData = await dueRes.json();
      const varietiesData = await varietiesRes.json();
      setRounds(Array.isArray(dueData.rounds) ? dueData.rounds : []);
      setVarieties(Array.isArray(varietiesData.varieties) ? varietiesData.varieties : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nhiệm vụ cần làm</CardTitle>
          <p className="text-sm text-text-secondary mt-1">
            Các lượt cấy giống thử nghiệm sắp/đã đến hạn cấy (trong 3 ngày tới), cần nhập số liệu.
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danh sách giống</CardTitle>
          <p className="text-sm text-text-secondary mt-1">
            Bấm vào 1 giống để xem lịch sử cập nhật dữ liệu (theo ngày cấy, từng đợt cấy) hoặc bắt đầu lượt cấy mới.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
          ) : varieties.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-12">Chưa có giống thử nghiệm nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light text-left text-primary-strong">
                    <th className="py-2 px-3 font-bold text-base">Mã</th>
                    <th className="py-2 px-3 font-bold text-base">Tên cây</th>
                    <th className="py-2 px-3 font-bold text-base">Loại cây</th>
                    <th className="py-2 px-3 font-bold text-base text-center">Số đợt cấy</th>
                    <th className="py-2 px-3 font-bold text-base">Lượt cấy gần nhất</th>
                    <th className="py-2 px-3 font-bold text-base"></th>
                  </tr>
                </thead>
                <tbody>
                  {varieties.map((v) => (
                    <tr key={v.id} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="py-2 px-3 font-mono text-info-foreground">{v.code}</td>
                      <td className="py-2 px-3 font-medium">{v.name}</td>
                      <td className="py-2 px-3 text-text-secondary">{v.plantGroup}</td>
                      <td className="py-2 px-3 text-center tabular-nums">{v.roundCount}</td>
                      <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                        {v.latestRound
                          ? `Cấy ${format(new Date(v.latestRound.plantedAt), "dd/MM/yyyy", { locale: vi })}${v.latestRound.recordedAt ? "" : " — chưa nhập kết quả"}`
                          : "Chưa có lượt cấy"}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Link href={`/rnd/${v.id}`}>
                          <Button type="button" variant="outline" size="sm">
                            <History className="w-3.5 h-3.5 mr-1.5" /> Xem lịch sử
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {activeRound && (
        <TrialRoundResultDialog
          round={activeRound}
          open={!!activeRound}
          onOpenChange={(o) => { if (!o) setActiveRound(null); }}
          onRecorded={load}
        />
      )}
    </div>
  );
}
