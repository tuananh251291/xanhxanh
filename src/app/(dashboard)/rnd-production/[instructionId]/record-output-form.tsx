"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

type InstructionDetail = {
  id: string;
  code: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "ENDED";
  inputMotherQuantity: number;
  plantType: { code: string; name: string };
  items: { motherMedium: { code: string; name: string } | null }[];
};

export default function RecordOutputForm({ instructionId }: { instructionId: string }) {
  const router = useRouter();
  const [instruction, setInstruction] = useState<InstructionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [motherContaminatedM05, setMotherContaminatedM05] = useState("0");
  const [motherUsed, setMotherUsed] = useState("0");
  const [m05, setM05] = useState("0");
  const [t05, setT05] = useState("0");
  const [t01, setT01] = useState("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rnd-production/instructions/${instructionId}`);
      if (!res.ok) { setInstruction(null); return; }
      setInstruction(await res.json());
    } finally {
      setLoading(false);
    }
  }, [instructionId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  if (!instruction) return <p className="text-sm text-text-muted text-center py-20">Không tìm thấy chỉ định</p>;
  if (instruction.status !== "ACTIVE") {
    return <p className="text-sm text-text-muted text-center py-20">Chỉ định này không ở trạng thái đang thực hiện, không nhập được kết quả</p>;
  }

  const num = (v: string) => Number(v) || 0;
  const motherChecked = num(motherUsed) + num(motherContaminatedM05);
  const exceeded = motherChecked > instruction.inputMotherQuantity;
  const medium = instruction.items[0]?.motherMedium;

  const submit = async () => {
    if (exceeded) { toast.error("Tổng MM nhiễm + MM sử dụng vượt quá số mẫu mẹ đã cấp"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/daily-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructionId,
          motherChecked,
          motherContaminatedM05: num(motherContaminatedM05),
          motherUsed: num(motherUsed),
          m05: num(m05),
          t05: num(t05),
          t01: num(t01),
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Lưu kết quả thất bại"); return; }
      toast.success(data.ended ? "Đã lưu kết quả — kì cấy đã kết thúc" : "Đã lưu kết quả");
      router.push("/rnd-production");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <p><span className="text-text-muted">Mã chỉ định:</span> <span className="font-mono font-medium text-foreground">{instruction.code}</span></p>
          <p><span className="text-text-muted">Mã cây:</span> <span className="font-medium text-foreground">{instruction.plantType.code} — {instruction.plantType.name}</span></p>
          <p><span className="text-text-muted">Môi trường:</span> <span className="font-medium text-foreground">{medium ? `${medium.code} — ${medium.name}` : "—"}</span></p>
          <p><span className="text-text-muted">Mẫu mẹ đã cấp:</span> <span className="font-medium text-foreground">{instruction.inputMotherQuantity.toLocaleString("vi-VN")}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mẫu mẹ nhiễm</Label>
              <Input type="number" min={0} value={motherContaminatedM05} onChange={(e) => setMotherContaminatedM05(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mẫu mẹ đã sử dụng</Label>
              <Input type="number" min={0} value={motherUsed} onChange={(e) => setMotherUsed(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-text-muted">
            MM đã kiểm tra (tự tính) = {motherChecked.toLocaleString("vi-VN")} / {instruction.inputMotherQuantity.toLocaleString("vi-VN")}
            {exceeded && <span className="text-destructive font-medium"> — vượt quá số mẫu mẹ đã cấp</span>}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">M05 trả ra</Label>
              <Input type="number" min={0} value={m05} onChange={(e) => setM05(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">T05 trả ra</Label>
              <Input type="number" min={0} value={t05} onChange={(e) => setT05(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">T01 trả ra</Label>
              <Input type="number" min={0} value={t01} onChange={(e) => setT01(e.target.value)} />
            </div>
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
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={submitting || exceeded} onClick={submit}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Lưu kết quả
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
