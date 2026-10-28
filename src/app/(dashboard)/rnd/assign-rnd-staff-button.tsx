"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

type Option = { value: string; label: string };
// "" = Chính mình (Admin đang thao tác).
const SELF: Option = { value: "", label: "Chính mình" };

// Nút "Giao cho NV cấy mô" trên thẻ nhiệm vụ lượt cấy giống thử nghiệm (Dashboard Admin kỹ thuật + tab Cập nhật
// tiến độ sản xuất ở R&D) — giao lại chỉ định cấy R&D đang chạy (chưa có dữ liệu cấy) cho 1 NV cấy mô, NV nhập
// dữ liệu ở trang Nhập dữ liệu cấy của mình. Xem PATCH /api/rnd-production/instructions/[id].
export default function AssignRndStaffButton({
  instructionId,
  currentAssigneeId,
  onDone,
}: {
  instructionId: string;
  currentAssigneeId: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([SELF]);
  const [selected, setSelected] = useState<Option>(SELF);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/rnd-production/staff")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; code: string; name: string; warehouseName: string | null }[]) => {
        const list = [SELF, ...(Array.isArray(data) ? data : []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}${s.warehouseName ? ` (${s.warehouseName})` : ""}` }))];
        setOptions(list);
        setSelected(list.find((o) => o.value === currentAssigneeId) ?? SELF);
      })
      .catch(() => {});
  }, [open, currentAssigneeId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/rnd-production/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: selected.value || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.message ?? "Giao việc thất bại"); return; }
      toast.success(selected.value ? `Đã giao cho ${selected.label}` : "Đã giao lại cho chính mình");
      setOpen(false);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setOpen(true)}>
        <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Giao cho NV cấy mô
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Giao lượt cấy cho NV cấy mô</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Giao cho</Label>
            <Combobox
              items={options}
              value={selected}
              isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
              onValueChange={(v) => setSelected((v as Option | null) ?? SELF)}
            >
              <ComboboxInputGroup>
                <ComboboxInput placeholder="Gõ tên/mã NV…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy NV</ComboboxEmpty>
                <ComboboxList>
                  {(item: Option) => <ComboboxItem key={item.value || "self"} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <p className="text-xs text-text-secondary">NV được giao nhập dữ liệu cấy ở trang Nhập dữ liệu cấy của mình.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Huỷ</Button>
            <Button className="bg-primary hover:bg-primary-hover" onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Giao việc
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
