"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type RecordDetail = {
  recordDate: string;
  motherUsed: number;
  motherChecked: number;
  motherContaminatedM05: number;
  notes: string | null;
  staff: { name: string; code: string };
  instruction: { code: string; plantType: { code: string; name: string } };
  items: { lot: { stageCode: string; quantity: number } }[];
  locked: boolean;
};

// Sửa nhật ký cấy đã lưu — CHỈ Admin/Admin cấp cao (xem PATCH /api/daily-records/[id]), dùng khi NV cấy
// mô nhập sai số liệu và NV không tự sửa lại được (mỗi ngày chỉ nhập 1 lần). Server tự chặn (trả cờ
// "locked") nếu bất kỳ lô nào đã tạo từ bản ghi này bị động tới ở nơi khác (bàn giao/kiểm tra
// nhiễm/nhiễm) — hiển thị rõ lý do thay vì cho sửa rồi mới báo lỗi.
export default function EditDailyRecordDialog({ recordId, onSaved }: { recordId: string; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [motherChecked, setMotherChecked] = useState("0");
  const [motherContaminatedM05, setMotherContaminatedM05] = useState("0");
  const [motherUsed, setMotherUsed] = useState("0");
  const [m05, setM05] = useState("0");
  const [t05, setT05] = useState("0");
  const [t01, setT01] = useState("0");
  const [notes, setNotes] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch(`/api/daily-records/${recordId}`);
    const data: RecordDetail = await res.json();
    setDetail(data);
    setMotherChecked(String(data.motherChecked));
    setMotherContaminatedM05(String(data.motherContaminatedM05));
    setMotherUsed(String(data.motherUsed));
    setM05(String(data.items.find((i) => i.lot.stageCode === "M05")?.lot.quantity ?? 0));
    setT05(String(data.items.find((i) => i.lot.stageCode === "T05")?.lot.quantity ?? 0));
    setT01(String(data.items.find((i) => i.lot.stageCode === "T01")?.lot.quantity ?? 0));
    setNotes(data.notes ?? "");
  }, [recordId]);

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/daily-records/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motherChecked: Number(motherChecked) || 0,
          motherContaminatedM05: Number(motherContaminatedM05) || 0,
          motherUsed: Number(motherUsed) || 0,
          m05: Number(m05) || 0,
          t05: Number(t05) || 0,
          t01: Number(t01) || 0,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã lưu chỉnh sửa nhật ký cấy");
      setOpen(false);
      router.refresh();
      onSaved?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className="h-7 px-2" title="Sửa nhật ký" />}>
        <Pencil className="w-3.5 h-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Sửa nhật ký cấy</DialogTitle></DialogHeader>

        {!detail ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : (
          <div className="space-y-4 mt-2">
            <p className="text-sm text-text-secondary">
              {detail.instruction.code} · {detail.instruction.plantType.code} — {format(new Date(detail.recordDate), "dd/MM/yyyy", { locale: vi })} · NV {detail.staff.name}
            </p>

            {detail.locked ? (
              <p className="text-sm text-destructive bg-danger-light rounded-md p-3">
                Ít nhất 1 lô tạo ra từ nhật ký này đã được xử lý tiếp ở nơi khác (kiểm tra nhiễm/bàn giao/ghi nhận
                nhiễm) — không thể sửa lại nữa để tránh sai lệch dữ liệu đã đi xa hơn.
              </p>
            ) : (
              <>
                <div className="text-sm text-info-foreground bg-info-light rounded-lg p-3 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p>1. MM đã kiểm tra = MM nhiễm + MM sử dụng</p>
                    <p>2. Số điền là cây hoặc cụm, không phải số túi</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">MM đã kiểm tra (cụm)</Label>
                    <Input type="number" min={0} value={motherChecked} onChange={(e) => setMotherChecked(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">MM nhiễm (cụm)</Label>
                    <Input type="number" min={0} value={motherContaminatedM05} onChange={(e) => setMotherContaminatedM05(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">MM sử dụng (cụm)</Label>
                    <Input type="number" min={0} value={motherUsed} onChange={(e) => setMotherUsed(e.target.value)} />
                  </div>
                  <div />
                  <div className="space-y-1">
                    <Label className="text-xs">M05 (cụm)</Label>
                    <Input type="number" min={0} value={m05} onChange={(e) => setM05(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">T05 (cây)</Label>
                    <Input type="number" min={0} value={t05} onChange={(e) => setT05(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">T01 (cây)</Label>
                    <Input type="number" min={0} value={t01} onChange={(e) => setT01(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ghi chú</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
              {!detail.locked && (
                <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={loading} onClick={submit}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Lưu
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
