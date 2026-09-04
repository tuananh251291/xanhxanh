"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Sprout, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type DueRound = {
  id: string;
  motherInputQuantity: number;
  waitWeeks: number;
  plantedAt: string;
  expectedReadyAt: string;
  trialVariety: { id: string; code: string; name: string };
};

// Tab "Cập nhật tiến độ sản xuất" (R&D, /rnd) — gợi ý nhiệm vụ ngày: mọi lượt cấy giống thử nghiệm đã
// đến/quá tuổi cấy (waitWeeks Admin tự nhập lúc bắt đầu lượt) mà chưa nhập số cây trả ra. Vào chi tiết
// từng giống (/rnd/[id]) để xem lịch sử đầy đủ hoặc bắt đầu lượt cấy mới.
export default function ProductionProgressTracker() {
  const [rounds, setRounds] = useState<DueRound[]>([]);
  const [loading, setLoading] = useState(true);

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
          Nhiệm vụ hôm nay — các lượt cấy giống thử nghiệm đã đến tuổi cấy, cần nhập số liệu.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : rounds.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">Không có giống nào đến tuổi cấy hôm nay</p>
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
                      Là giống <Link href={`/rnd/${r.trialVariety.id}`} className="text-info-foreground underline underline-offset-2">{r.trialVariety.name} ({r.trialVariety.code})</Link> — đến tuổi cấy
                    </p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Cấy ngày {format(new Date(r.plantedAt), "dd/MM/yyyy", { locale: vi })} — chờ {r.waitWeeks} tuần
                      {" "}(mẫu mẹ đưa vào: {r.motherInputQuantity.toLocaleString("vi-VN")})
                    </p>
                  </div>
                </div>
                <RecordResultDialog round={r} onRecorded={load} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecordResultDialog({ round, onRecorded }: { round: DueRound; onRecorded: () => void }) {
  const [open, setOpen] = useState(false);
  const [outputQuantity, setOutputQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const qty = Number(outputQuantity);
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error("Nhập số cây trả ra hợp lệ (số nguyên, không âm)");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/trial-cultivation-rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputQuantity: qty, notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Ghi nhận thất bại"); return; }
      toast.success("Đã ghi nhận kết quả");
      setOpen(false);
      onRecorded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" className="bg-primary hover:bg-primary-hover shrink-0" />}>
        <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Nhập kết quả
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nhập kết quả lượt cấy — {round.trialVariety.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">Số lượng mẫu mẹ đưa vào cấy</Label>
            <Input value={round.motherInputQuantity.toLocaleString("vi-VN")} disabled />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Số cây/cụm trả ra <span className="text-destructive">*</span></Label>
            <Input
              type="number" min={0} value={outputQuantity}
              onChange={(e) => setOutputQuantity(e.target.value)}
              placeholder="VD: 25"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={saving || !outputQuantity} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Lưu kết quả
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
