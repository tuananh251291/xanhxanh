"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Loader2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

type MediumType = { id: string; code: string; name: string };

export type DueTrialRound = {
  id: string;
  motherInputQuantity: number;
  waitWeeks: number;
  // string khi đến từ API (JSON, xem GET /api/trial-varieties/due-rounds), Date khi truyền thẳng từ
  // server component (xem dashboard/page.tsx TrialRoundTaskCard) — RSC hỗ trợ Date qua props trực tiếp.
  plantedAt: string | Date;
  expectedReadyAt: string | Date;
  trialVariety: { id: string; code: string; name: string };
};

// Bảng "Cập nhật dữ liệu cấy" cho 1 lượt cấy giống thử nghiệm — CỐ TÌNH giống hệt giao diện Nhập dữ liệu
// cấy thật của NV cấy mô (MM nhiễm/MM sử dụng/MM đã kiểm tra + M05/T05/T01, xem
// src/app/(dashboard)/daily-record/page.tsx) để Admin kỹ thuật dùng quen tay, nhưng ghi vào
// TrialCultivationRound (KHÔNG đụng gì Lot/tồn kho/lương thật — xem comment model trong schema.prisma).
// Dùng chung cho cả thẻ nhiệm vụ ở Dashboard lẫn tab "Cập nhật tiến độ sản xuất" trong R&D.
export default function TrialRoundResultDialog({
  round, open, onOpenChange, onRecorded,
}: {
  round: DueTrialRound;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}) {
  const [motherContaminatedM05, setMotherContaminatedM05] = useState("");
  const [motherUsed, setMotherUsed] = useState("");
  const [m05, setM05] = useState("");
  const [t05, setT05] = useState("");
  const [t01, setT01] = useState("");
  const [mediumTypeId, setMediumTypeId] = useState("");
  const [mediumTypes, setMediumTypes] = useState<MediumType[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/medium-types").then((r) => r.json()).then((data: MediumType[]) => setMediumTypes(Array.isArray(data) ? data : []));
  }, [open]);

  const motherChecked = (Number(motherUsed) || 0) + (Number(motherContaminatedM05) || 0);

  const reset = () => {
    setMotherContaminatedM05(""); setMotherUsed(""); setM05(""); setT05(""); setT01(""); setMediumTypeId(""); setNotes("");
  };

  const canSubmit = motherUsed.trim() !== "" && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/trial-cultivation-rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motherContaminatedM05: Number(motherContaminatedM05) || 0,
          motherUsed: Number(motherUsed) || 0,
          m05Quantity: Number(m05) || 0,
          t05Quantity: Number(t05) || 0,
          t01Quantity: Number(t01) || 0,
          mediumTypeId: mediumTypeId || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Ghi nhận thất bại"); return; }
      toast.success("Đã ghi nhận kết quả cấy");
      reset();
      onOpenChange(false);
      onRecorded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" /> Cập nhật dữ liệu cấy — {round.trialVariety.name} ({round.trialVariety.code})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="flex items-start gap-2 text-sm text-info-foreground bg-info-light rounded-lg p-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>1. MM đã kiểm tra = MM nhiễm + MM sử dụng</p>
              <p>2. Số điền là cây hoặc cụm, không phải số túi</p>
              <p>3. Số mẫu mẹ đã đưa vào cấy: <strong>{round.motherInputQuantity.toLocaleString("vi-VN")}</strong></p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">MM nhiễm (cụm)</Label>
              <Input type="number" min={0} placeholder="_" value={motherContaminatedM05} onChange={(e) => setMotherContaminatedM05(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">MM sử dụng (cụm) <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} placeholder="_" value={motherUsed} onChange={(e) => setMotherUsed(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">MM đã kiểm tra (cụm)</Label>
              <Input type="number" disabled value={motherChecked} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">M05 (cụm)</Label>
              <Input type="number" min={0} placeholder="_" value={m05} onChange={(e) => setM05(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">T05 (cây)</Label>
              <Input type="number" min={0} placeholder="_" value={t05} onChange={(e) => setT05(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">T01 (cây)</Label>
              <Input type="number" min={0} placeholder="_" value={t01} onChange={(e) => setT01(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Loại môi trường</Label>
            <Select
              items={mediumTypes.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))}
              value={mediumTypeId}
              onValueChange={(v) => setMediumTypeId(v as string)}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn loại môi trường" /></SelectTrigger>
              <SelectContent>
                {mediumTypes.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={!canSubmit} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Lưu kết quả
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
