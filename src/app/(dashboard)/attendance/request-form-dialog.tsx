"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ATTENDANCE_REQUEST_TYPE_LABELS, DAY_PORTION_LABELS, LEAVE_TYPES } from "@/lib/attendance";
import type { AttendanceDayPortion, AttendanceRequestType } from "@prisma/client";

const TYPE_HINTS: Record<AttendanceRequestType, string> = {
  ANNUAL_LEAVE: "Có lương, trừ vào quỹ phép năm.",
  SICK_LEAVE: "Nghỉ do ốm đau.",
  UNPAID_LEAVE: "Không hưởng lương ngày nghỉ.",
  LATE_EARLY: "Xin phép đi muộn / về sớm — số phút được duyệt sẽ không tính vi phạm.",
  MISSED_CHECK: "Quên chấm vào/ra — khai giờ thực tế để được tính công.",
};

export default function RequestFormDialog({
  open,
  onOpenChange,
  todayKey,
  remainingAnnualLeave,
  onCreated,
  initialType,
  initialDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todayKey: string;
  remainingAnnualLeave: number;
  onCreated: () => void;
  initialType?: AttendanceRequestType;
  initialDate?: string;
}) {
  const [type, setType] = useState<AttendanceRequestType>(initialType ?? "ANNUAL_LEAVE");
  const [startDate, setStartDate] = useState(initialDate ?? todayKey);
  const [endDate, setEndDate] = useState(initialDate ?? todayKey);
  const [dayPortion, setDayPortion] = useState<AttendanceDayPortion>("FULL");
  const [lateMinutes, setLateMinutes] = useState("");
  const [earlyMinutes, setEarlyMinutes] = useState("");
  const [missedCheckIn, setMissedCheckIn] = useState("");
  const [missedCheckOut, setMissedCheckOut] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Mở lại với loại/ngày gợi ý mới (VD bấm "Gửi giải trình" ở 1 ngày thiếu chấm) — đặt lại form.
  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  const openKey = open ? `${initialType ?? ""}|${initialDate ?? ""}` : null;
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey) {
      setType(initialType ?? "ANNUAL_LEAVE");
      setStartDate(initialDate ?? todayKey);
      setEndDate(initialDate ?? todayKey);
      setDayPortion("FULL");
      setLateMinutes(""); setEarlyMinutes(""); setMissedCheckIn(""); setMissedCheckOut(""); setReason("");
    }
  }

  const isLeave = LEAVE_TYPES.includes(type);
  const singleDay = !isLeave || startDate === endDate;

  const submit = async () => {
    setSaving(true);
    try {
      const body = {
        type,
        startDate,
        endDate: isLeave ? endDate : startDate,
        dayPortion: isLeave && singleDay ? dayPortion : "FULL",
        lateMinutes: type === "LATE_EARLY" && lateMinutes ? Number(lateMinutes) : undefined,
        earlyMinutes: type === "LATE_EARLY" && earlyMinutes ? Number(earlyMinutes) : undefined,
        missedCheckIn: type === "MISSED_CHECK" && missedCheckIn ? missedCheckIn : undefined,
        missedCheckOut: type === "MISSED_CHECK" && missedCheckOut ? missedCheckOut : undefined,
        reason,
      };
      const res = await fetch("/api/attendance/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Gửi đơn thất bại"); return; }
      toast.success(json.status === "PENDING_MANAGER" ? "Đã gửi đơn — chờ quản lý khu duyệt" : "Đã gửi đơn — chờ HCNS duyệt");
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo đơn</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Loại đơn</Label>
            <Select items={ATTENDANCE_REQUEST_TYPE_LABELS} value={type} onValueChange={(v) => setType(v as AttendanceRequestType)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ATTENDANCE_REQUEST_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-secondary">
              {TYPE_HINTS[type]}
              {type === "ANNUAL_LEAVE" && ` Còn ${remainingAnnualLeave} ngày.`}
            </p>
          </div>

          {isLeave ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Từ ngày</Label>
                <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
              </div>
              <div className="space-y-1">
                <Label>Đến ngày</Label>
                <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Ngày</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          )}

          {isLeave && singleDay && (
            <div className="space-y-1">
              <Label>Thời gian nghỉ</Label>
              <Select items={DAY_PORTION_LABELS} value={dayPortion} onValueChange={(v) => setDayPortion(v as AttendanceDayPortion)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DAY_PORTION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "LATE_EARLY" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Đi muộn (phút)</Label>
                <Input type="number" min={0} inputMode="numeric" value={lateMinutes} onChange={(e) => setLateMinutes(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Về sớm (phút)</Label>
                <Input type="number" min={0} inputMode="numeric" value={earlyMinutes} onChange={(e) => setEarlyMinutes(e.target.value)} />
              </div>
            </div>
          )}

          {type === "MISSED_CHECK" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Giờ vào thực tế</Label>
                <Input type="time" value={missedCheckIn} onChange={(e) => setMissedCheckIn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Giờ ra thực tế</Label>
                <Input type="time" value={missedCheckOut} onChange={(e) => setMissedCheckOut(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Lý do</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Nhập lý do…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={submit} disabled={saving || reason.trim().length < 3}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Gửi đơn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
