"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { ShieldOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Staff = { id: string; code: string; name: string; role: string };
type ViolationType = { id: string; label: string; points: number };
type ComboOption = { value: string; label: string };

// Ghi nhận vi phạm TRỰC TIẾP cho 1 NV cấy mô — khác "Ghi nhận kiểm tra" (dark-room-inspection-dialog.tsx,
// chỉ NV kho mô, gắn với 1 lượt "Kiểm tra kho tối") — dialog này không cần lượt kiểm tra nào, dùng cho
// Kho mô/Kỹ thuật/Hành chính nhân sự/Admin/Admin cấp cao khi trực tiếp thấy 1 NV vi phạm.
export default function RecordViolationDialog({
  violationTypes,
  onSaved,
}: {
  violationTypes: ViolationType[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffOption, setStaffOption] = useState<ComboOption | null>(null);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/users").then((r) => r.json()).then((d) => setStaffList(Array.isArray(d) ? d.filter((u: Staff) => u.role === "CAY_MO") : []));
  }, [open]);

  const staffOptions = useMemo(() => staffList.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })), [staffList]);

  const resetForm = () => {
    setStaffOption(null);
    setSelectedTypeIds([]);
  };

  const toggleType = (id: string) => {
    setSelectedTypeIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!staffOption || selectedTypeIds.length === 0) {
      toast.error("Cần chọn NV cấy mô và ít nhất 1 loại lỗi");
      return;
    }
    setSubmitting(true);
    try {
      // Gửi lần lượt từng loại lỗi — mỗi lỗi 1 dòng ViolationRecord riêng, tự tính điểm áp dụng riêng
      // (x1.5 nếu đã có lỗi cùng loại của NV này trong kỳ, kể cả các dòng vừa gửi trước đó trong lượt này).
      for (const violationTypeId of selectedTypeIds) {
        const res = await fetch("/api/violation-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffId: staffOption.value, violationTypeId }),
        });
        if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      }
      toast.success(`Đã ghi nhận ${selectedTypeIds.length} lỗi vi phạm cho ${staffOption.label}`);
      resetForm();
      setOpen(false);
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button size="sm" className="bg-primary hover:bg-primary-hover shrink-0" />}>
        <ShieldOff className="w-4 h-4 mr-1.5" /> Ghi nhận vi phạm
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Ghi nhận vi phạm trực tiếp</DialogTitle></DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label className="text-sm">NV cấy mô *</Label>
            <Combobox
              items={staffOptions}
              value={staffOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={setStaffOption}
            >
              <ComboboxInputGroup className="w-full h-9">
                <ComboboxInput placeholder="Gõ tên hoặc mã NV…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy NV cấy mô</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="space-y-1">
            <Label className="text-sm">Lỗi vi phạm *</Label>
            <div className="rounded-lg border border-divider divide-y divide-divider max-h-56 overflow-y-auto">
              {violationTypes.length === 0 ? (
                <p className="text-sm text-text-muted p-3">Chưa có loại lỗi vi phạm nào</p>
              ) : (
                violationTypes.map((t) => (
                  <label key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Checkbox checked={selectedTypeIds.includes(t.id)} onCheckedChange={() => toggleType(t.id)} />
                      {t.label}
                    </span>
                    <span className="text-xs text-text-muted">−{t.points} điểm</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ghi nhận
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
