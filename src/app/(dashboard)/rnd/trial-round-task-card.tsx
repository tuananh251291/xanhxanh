"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sprout, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import TrialRoundResultDialog, { type DueTrialRound } from "@/components/shared/trial-round-result-dialog";

// Thẻ "Nhiệm vụ cần hoàn thành" trên Dashboard Admin kỹ thuật — lượt cấy giống thử nghiệm sắp/đã đến hạn
// cấy (trong 3 ngày tới, xem GET /api/trial-varieties/due-rounds, cùng nguồn dữ liệu với tab "Cập nhật
// tiến độ sản xuất" trong R&D). Nhận `rounds` từ server component cha (dashboard/page.tsx) — dùng
// router.refresh() sau khi lưu thay vì tự fetch lại, vì dữ liệu gốc là server-side.
export default function TrialRoundTaskCard({ rounds }: { rounds: DueTrialRound[] }) {
  const router = useRouter();
  const [activeRound, setActiveRound] = useState<DueTrialRound | null>(null);

  if (rounds.length === 0) return null;

  return (
    <Card className="border border-primary-light bg-primary-light">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-primary-strong">
          <Sprout className="w-4 h-4" /> Nhiệm vụ cần hoàn thành — Cấy chuyển giống thử nghiệm
        </CardTitle>
        <p className="text-sm text-primary-strong/80">
          {rounds.length} giống sắp/đã đến hạn cấy (trong 3 ngày tới), cần Cập nhật dữ liệu cấy.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rounds.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary-light bg-white flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Giống <Link href={`/rnd/${r.trialVariety.id}`} className="text-info-foreground underline underline-offset-2">{r.trialVariety.name} ({r.trialVariety.code})</Link>
                {" "}— đến hạn cấy {format(new Date(r.expectedReadyAt), "dd/MM/yyyy", { locale: vi })}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                Cấy ngày {format(new Date(r.plantedAt), "dd/MM/yyyy", { locale: vi })} — chờ {r.waitWeeks} tuần
                {" "}(mẫu mẹ đưa vào: {r.motherInputQuantity.toLocaleString("vi-VN")})
              </p>
            </div>
            <Button type="button" size="sm" className="bg-primary hover:bg-primary-hover shrink-0" onClick={() => setActiveRound(r)}>
              <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Thực hiện nhiệm vụ
            </Button>
          </div>
        ))}
      </CardContent>
      {activeRound && (
        <TrialRoundResultDialog
          round={activeRound}
          open={!!activeRound}
          onOpenChange={(o) => { if (!o) setActiveRound(null); }}
          onRecorded={() => { setActiveRound(null); router.refresh(); }}
        />
      )}
    </Card>
  );
}
