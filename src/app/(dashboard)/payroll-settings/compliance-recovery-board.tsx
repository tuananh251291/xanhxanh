"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxInputGroup, ComboboxItem, ComboboxList, ComboboxTrigger,
} from "@/components/ui/combobox";
import { Loader2, Plus, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Staff = { id: string; code: string; name: string; role: string };
type ComboOption = { value: string; label: string };
type Row = { id: string; periodMonth: string; points: number; reason: string; staff: { code: string; name: string } };
type BehaviorType = { id: string; label: string; points: number };

// Điểm phục hồi — HR tự nhập tay cho 1 NV cấy mô, 1 kỳ lương cụ thể, CỘNG vào điểm tuân thủ cuối kỳ.
// Không có cơ chế tự sinh — hoàn toàn do HR quyết định khi nào thưởng phục hồi điểm.
export default function ComplianceRecoveryBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffOption, setStaffOption] = useState<ComboOption | null>(null);
  const [periodMonth, setPeriodMonth] = useState(format(new Date(), "yyyy-MM"));
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [behaviorTypes, setBehaviorTypes] = useState<BehaviorType[]>([]);
  const [behaviorOption, setBehaviorOption] = useState<ComboOption | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/recovery-points");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/users").then((r) => r.json()).then((d) => setStaffList(Array.isArray(d) ? d.filter((u: Staff) => u.role === "CAY_MO") : []));
    fetch("/api/recovery-behavior-types").then((r) => r.json()).then((d) => setBehaviorTypes(Array.isArray(d) ? d : []));
  }, [load]);

  const staffOptions = useMemo(() => staffList.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })), [staffList]);
  const behaviorOptions = useMemo(() => behaviorTypes.map((t) => ({ value: t.id, label: t.label })), [behaviorTypes]);

  // Chọn 1 hành vi từ danh mục tự điền sẵn điểm + lý do (label của hành vi) — HR vẫn sửa lại được trước
  // khi lưu, không bắt buộc chọn (bỏ trống vẫn nhập tay tự do như trước).
  const selectBehavior = (opt: ComboOption | null) => {
    setBehaviorOption(opt);
    if (opt) {
      const t = behaviorTypes.find((bt) => bt.id === opt.value);
      if (t) {
        setPoints(String(t.points));
        setReason(t.label);
      }
    }
  };

  const add = async () => {
    const value = Number(points);
    if (!staffOption || !periodMonth || !Number.isFinite(value) || !reason.trim()) {
      toast.error("Cần nhập đủ NV, kỳ, số điểm và lý do");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/recovery-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: staffOption.value, periodMonth, points: value, reason: reason.trim(),
          behaviorTypeId: behaviorOption?.value,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã thêm điểm phục hồi cho ${staffOption.label}`);
      setStaffOption(null);
      setBehaviorOption(null);
      setPoints("");
      setReason("");
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Xoá điểm phục hồi này?")) return;
    const res = await fetch(`/api/payroll/recovery-points/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
    toast.success("Đã xoá");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1 w-56">
              <label className="text-xs text-text-secondary">Hành vi (tuỳ chọn)</label>
              <Combobox
                items={behaviorOptions}
                value={behaviorOption}
                isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                onValueChange={selectBehavior}
              >
                <ComboboxInputGroup className="h-9">
                  <ComboboxInput placeholder="Chọn hành vi có sẵn…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Chưa có hành vi nào — xem tab &quot;Cài đặt điểm phục hồi&quot;</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="space-y-1 w-56">
              <label className="text-xs text-text-secondary">NV cấy mô</label>
              <Combobox
                items={staffOptions}
                value={staffOption}
                isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                onValueChange={setStaffOption}
              >
                <ComboboxInputGroup className="h-9">
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
              <label className="text-xs text-text-secondary">Kỳ</label>
              <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="w-36 h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Điểm phục hồi</label>
              <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} className="w-32 h-9" />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <label className="text-xs text-text-secondary">Lý do</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Đã khắc phục, không tái phạm" className="h-9" />
            </div>
            <Button onClick={add} disabled={saving} className="bg-primary hover:bg-primary-hover">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Thêm
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted"><p>Chưa có điểm phục hồi nào</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-lg divide-y divide-divider">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm flex-wrap">
                  <ShieldCheck className="w-4 h-4 text-primary-strong shrink-0" />
                  <span className="font-medium text-foreground">{r.staff.name}</span>
                  <span className="font-mono text-text-muted text-xs">({r.staff.code})</span>
                  <span className="text-xs text-text-muted">Kỳ {r.periodMonth}</span>
                  <span className="font-semibold text-primary-strong">+{r.points} điểm</span>
                  <span className="flex-1 text-text-secondary text-xs">{r.reason}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(r.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
