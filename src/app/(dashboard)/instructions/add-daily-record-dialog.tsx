"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

// Bù dữ liệu cấy cho 1 ngày NV cấy mô bỏ sót chưa nhập — CHỈ Admin/Admin cấp cao, chỉ áp dụng cho ngày
// thuộc tuần chỉ định đang là tuần hiện tại và không sau hôm nay (server validate lại, xem POST
// /api/daily-records nhánh isAdmin). Bản ghi tạo ra đứng tên đúng NV đã được gán (staffId = assignedToId),
// không đứng tên Admin.
export default function AddDailyRecordDialog({
  instructionId,
  date,
  staffName,
  onSaved,
}: {
  instructionId: string;
  date: Date;
  staffName: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Để trống (không mặc định "0") — dễ gõ nhầm nếu có sẵn "0" (VD gõ "5" thành "05" rồi quên xoá).
  const [motherContaminatedM05, setMotherContaminatedM05] = useState("");
  const [motherUsed, setMotherUsed] = useState("");
  const [m05, setM05] = useState("");
  const [t05, setT05] = useState("");
  const [t01, setT01] = useState("");
  const [notes, setNotes] = useState("");
  const router = useRouter();

  // MM đã kiểm tra KHÔNG tự nhập — luôn tự tính = MM nhiễm + MM sử dụng.
  const motherChecked = (Number(motherUsed) || 0) + (Number(motherContaminatedM05) || 0);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/daily-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructionId,
          date: date.toISOString(),
          motherChecked,
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
      toast.success(`Đã bù dữ liệu cấy ngày ${format(date, "dd/MM", { locale: vi })}`);
      setOpen(false);
      router.refresh();
      onSaved?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-7 px-2 text-text-secondary" />}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Thêm dữ liệu
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Bù dữ liệu cấy — {format(date, "EEEE dd/MM/yyyy", { locale: vi })}</DialogTitle></DialogHeader>

        <div className="space-y-4 mt-2">
          <p className="text-sm text-text-secondary">
            NV cấy mô: {staffName} — chưa có dữ liệu ngày này, dùng khi NV quên nhập hoặc nhập sai cần bù lại.
          </p>

          <div className="text-sm text-info-foreground bg-info-light rounded-lg p-3 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>1. MM đã kiểm tra = MM nhiễm + MM sử dụng</p>
              <p>2. Số điền là cây hoặc cụm, không phải số túi</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">MM nhiễm (cụm)</Label>
              <Input type="number" min={0} placeholder="_" value={motherContaminatedM05} onChange={(e) => setMotherContaminatedM05(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">MM sử dụng (cụm)</Label>
              <Input type="number" min={0} placeholder="_" value={motherUsed} onChange={(e) => setMotherUsed(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">MM đã kiểm tra (cụm)</Label>
              <Input type="number" disabled value={motherChecked} />
            </div>
            <div />
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
            <Label className="text-xs">Ghi chú</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={loading} onClick={submit}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
