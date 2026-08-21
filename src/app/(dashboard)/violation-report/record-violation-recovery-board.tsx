"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxInputGroup, ComboboxItem, ComboboxList, ComboboxTrigger,
} from "@/components/ui/combobox";
import { ShieldOff, ShieldCheck, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Staff = { id: string; code: string; name: string; role: string };
type ComboOption = { value: string; label: string };
type ViolationType = { id: string; label: string; points: number; groupName: string | null };
type BehaviorType = { id: string; label: string; points: number };

const UNGROUPED = "Chưa phân nhóm";

// Gộp 2 luồng ghi nhận trước đây tách rời — "Ghi nhận vi phạm" (từng ở /violation-types, đã gỡ) và
// "Điểm phục hồi" (vẫn còn nguyên ở /payroll-settings, tab này là lối vào bổ sung) — thành 1 form duy
// nhất: chọn kỳ áp dụng + NV + Vi phạm (nhóm lỗi → tên lỗi) hoặc Tích cực (hành vi phục hồi), hệ thống tự
// áp dụng đúng hiệu ứng theo cấu hình sẵn có của mục đã chọn (trừ điểm / cộng điểm / không tính KPI —
// xem ViolationType.disqualifiesComplianceKpi/disqualifiesProductionKpi, computePayrollForPeriod).
export default function RecordViolationRecoveryBoard({ canRecordPositive }: { canRecordPositive: boolean }) {
  const [mode, setMode] = useState<"VI_PHAM" | "TICH_CUC">("VI_PHAM");
  const [periodMonth, setPeriodMonth] = useState(format(new Date(), "yyyy-MM"));
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffOption, setStaffOption] = useState<ComboOption | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [violationTypes, setViolationTypes] = useState<ViolationType[]>([]);
  const [groupName, setGroupName] = useState<string>("");
  const [violationTypeId, setViolationTypeId] = useState<string>("");

  const [behaviorTypes, setBehaviorTypes] = useState<BehaviorType[]>([]);
  const [behaviorOption, setBehaviorOption] = useState<ComboOption | null>(null);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((d) => setStaffList(Array.isArray(d) ? d.filter((u: Staff) => u.role === "CAY_MO") : []));
    fetch("/api/violation-types").then((r) => r.json()).then((d) => setViolationTypes(Array.isArray(d) ? d : []));
    fetch("/api/recovery-behavior-types").then((r) => r.json()).then((d) => setBehaviorTypes(Array.isArray(d) ? d : []));
  }, []);

  const staffOptions = useMemo(() => staffList.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })), [staffList]);
  const behaviorOptions = useMemo(() => behaviorTypes.map((t) => ({ value: t.id, label: t.label })), [behaviorTypes]);

  const groupOptions = useMemo(
    () => Array.from(new Set(violationTypes.map((t) => t.groupName?.trim() || UNGROUPED))).sort(),
    [violationTypes]
  );
  const typesInGroup = useMemo(
    () => violationTypes.filter((t) => (t.groupName?.trim() || UNGROUPED) === groupName),
    [violationTypes, groupName]
  );
  const selectedViolationType = violationTypes.find((t) => t.id === violationTypeId) ?? null;

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

  const resetForm = () => {
    setStaffOption(null);
    setGroupName("");
    setViolationTypeId("");
    setBehaviorOption(null);
    setPoints("");
    setReason("");
  };

  const submitViolation = async () => {
    if (!staffOption || !violationTypeId) {
      toast.error("Cần chọn NV cấy mô và tên lỗi");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/violation-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: staffOption.value, violationTypeId, periodMonth }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      const t = selectedViolationType;
      const effect = t && (t.points === 0)
        ? `không tính Thưởng KPI kỳ ${periodMonth}`
        : `-${t?.points ?? 0} điểm tuân thủ`;
      toast.success(`Đã ghi nhận vi phạm cho ${staffOption.label} (${effect})`);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  const submitRecovery = async () => {
    const value = Number(points);
    if (!staffOption || !Number.isFinite(value) || !reason.trim()) {
      toast.error("Cần chọn NV, nhập điểm và lý do");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/payroll/recovery-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: staffOption.value, periodMonth, points: value, reason: reason.trim(), behaviorTypeId: behaviorOption?.value }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã thêm +${value} điểm phục hồi cho ${staffOption.label} (kỳ ${periodMonth})`);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button
              type="button" size="sm"
              variant={mode === "VI_PHAM" ? "default" : "outline"}
              className={mode === "VI_PHAM" ? "bg-destructive hover:bg-destructive/90 text-black" : ""}
              onClick={() => setMode("VI_PHAM")}
            >
              <ShieldOff className="w-4 h-4 mr-1.5" /> Vi phạm
            </Button>
            {canRecordPositive && (
              <Button
                type="button" size="sm"
                variant={mode === "TICH_CUC" ? "default" : "outline"}
                className={mode === "TICH_CUC" ? "bg-primary hover:bg-primary-hover" : ""}
                onClick={() => setMode("TICH_CUC")}
              >
                <ShieldCheck className="w-4 h-4 mr-1.5" /> Tích cực
              </Button>
            )}
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Kỳ áp dụng</Label>
              <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="w-36 h-9" />
            </div>
            <div className="space-y-1 w-56">
              <Label className="text-xs">NV cấy mô</Label>
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

            {mode === "VI_PHAM" ? (
              <>
                <div className="space-y-1 w-56">
                  <Label className="text-xs">Nhóm lỗi</Label>
                  <Select
                    items={groupOptions.map((g) => ({ value: g, label: g }))}
                    value={groupName}
                    onValueChange={(v) => { setGroupName((v as string) ?? ""); setViolationTypeId(""); }}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Chọn nhóm lỗi" /></SelectTrigger>
                    <SelectContent>
                      {groupOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 w-64">
                  <Label className="text-xs">Tên lỗi</Label>
                  <Select
                    items={typesInGroup.map((t) => ({ value: t.id, label: t.label }))}
                    value={violationTypeId}
                    onValueChange={(v) => setViolationTypeId((v as string) ?? "")}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder={groupName ? "Chọn tên lỗi" : "Chọn nhóm lỗi trước"} /></SelectTrigger>
                    <SelectContent>
                      {typesInGroup.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {selectedViolationType && (
                  <p className="text-xs text-text-muted w-full">
                    Hiệu ứng: {selectedViolationType.points === 0
                      ? "không tính Thưởng KPI tuân thủ và/hoặc Thưởng vượt KPI sản lượng của kỳ (không trừ điểm)"
                      : `-${selectedViolationType.points} điểm tuân thủ`}
                  </p>
                )}
                <Button onClick={submitViolation} disabled={submitting} className="bg-destructive hover:bg-destructive/90 text-black">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
                  Ghi nhận
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1 w-56">
                  <Label className="text-xs">Hành vi (tuỳ chọn)</Label>
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
                      <ComboboxEmpty>Chưa có hành vi nào — xem Cài đặt lương</ComboboxEmpty>
                      <ComboboxList>
                        {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Điểm phục hồi</Label>
                  <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} className="w-28 h-9" />
                </div>
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <Label className="text-xs">Lý do</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Đã khắc phục, không tái phạm" className="h-9" />
                </div>
                <Button onClick={submitRecovery} disabled={submitting} className="bg-primary hover:bg-primary-hover">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
                  Ghi nhận
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
