"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

// Bù dữ liệu cấy cho 1 ngày NV cấy mô bỏ sót chưa nhập — CHỈ Admin/Admin cấp cao, chỉ áp dụng cho ngày
// thuộc tuần chỉ định đang là tuần hiện tại và không sau hôm nay (server validate lại, xem POST
// /api/daily-records nhánh isAdmin). Bản ghi tạo ra đứng tên đúng NV đã được gán (staffId = assignedToId),
// không đứng tên Admin.
export default function AddDailyRecordDialog({ instructionId, date, staffName }: { instructionId: string; date: Date; staffName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motherChecked, setMotherChecked] = useState("0");
  const [motherContaminatedM05, setMotherContaminatedM05] = useState("0");
  const [motherUsed, setMotherUsed] = useState("0");
  const [m05, setM05] = useState("0");
  const [t05, setT05] = useState("0");
  const [t01, setT01] = useState("0");
  const [notes, setNotes] = useState("");
  const router = useRouter();

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/daily-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructionId,
          date: date.toISOString(),
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
      toast.success(`Đã bù dữ liệu cấy ngày ${format(date, "dd/MM", { locale: vi })}`);
      setOpen(false);
      router.refresh();
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
