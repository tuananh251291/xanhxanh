"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Loader2, Send, Bell } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, endOfWeek, startOfDay } from "date-fns";
import { vi } from "date-fns/locale";
import { EXTRA_WORK_REQUEST_STATUS_LABELS, WORK_SESSION_LABELS, EXTRA_WORK_PURPOSE_LABELS } from "@/types";

type RequestType = "EARLY_COMPLETION" | "OVERTIME";
type OvertimeSlot = { date: string; startTime: string; endTime: string };
type OvertimePurpose = "COMPLETE_MAIN_INSTRUCTION" | "INCREASE_OUTPUT";

type RequestHistoryItem = {
  id: string;
  type: RequestType;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  instruction: { code: string } | null;
  expectedEndDate: string | null;
  expectedEndSession: "SANG" | "CHIEU" | null;
  slots: { date: string; startTime: string; endTime: string }[];
  purpose: OvertimePurpose | null;
};

const STATUS_BADGE_VARIANT = {
  PENDING: "in-progress",
  APPROVED: "completed",
  REJECTED: "overdue",
} as const;

const emptySlot = (): OvertimeSlot => ({ date: "", startTime: "", endTime: "" });

// Đăng ký cấy thêm — dùng chung cho cả giao diện nâng cao (/extra-work) và cơ bản
// (/dashboard-basic/dang-ky-cay-them), CHỈ NV cấy mô. 2 bảng loại trừ nhau (chọn 1 thì khoá bảng kia) —
// Bảng 1 chỉ báo trước cho Kho mô (không có luồng từ chối), Bảng 2 Kho mô xét duyệt Đồng ý/Từ chối.
export default function ExtraWorkRequestForm({ hideHeader = false }: { hideHeader?: boolean }) {
  const [selected, setSelected] = useState<RequestType | null>(null);
  const [expectedEndDate, setExpectedEndDate] = useState("");
  const [expectedEndSession, setExpectedEndSession] = useState<"SANG" | "CHIEU">("SANG");
  const [slots, setSlots] = useState<OvertimeSlot[]>([emptySlot()]);
  const [overtimePurpose, setOvertimePurpose] = useState<OvertimePurpose | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<RequestHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const today = useMemo(() => startOfDay(new Date()), []);
  const tomorrowStr = useMemo(() => format(addDays(today, 1), "yyyy-MM-dd"), [today]);
  const weekEndStr = useMemo(() => format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), [today]);

  const loadHistory = useCallback(() => {
    setLoadingHistory(true);
    fetch("/api/extra-work-requests")
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .finally(() => setLoadingHistory(false));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const addSlotRow = () => setSlots((prev) => [...prev, emptySlot()]);
  const removeSlotRow = (idx: number) => setSlots((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  const updateSlot = (idx: number, field: keyof OvertimeSlot, value: string) =>
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));

  const submitEarlyCompletion = async () => {
    if (!expectedEndDate) { toast.error("Chọn ngày dự kiến kết thúc"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/extra-work-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "EARLY_COMPLETION", expectedEndDate, expectedEndSession }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã gửi thông báo hoàn thành sớm cho Kho mô");
      setSelected(null);
      setExpectedEndDate("");
      setExpectedEndSession("SANG");
      loadHistory();
    } finally {
      setSubmitting(false);
    }
  };

  const submitOvertime = async () => {
    if (!overtimePurpose) { toast.error("Chọn lý do đăng ký làm thêm"); return; }
    for (const s of slots) {
      if (!s.date || !s.startTime || !s.endTime) { toast.error("Điền đủ ngày, giờ bắt đầu và giờ kết thúc cho mọi dòng"); return; }
      if (s.date < tomorrowStr || s.date > weekEndStr) { toast.error(`Ngày ${s.date} ngoài phạm vi cho phép`); return; }
      if (s.startTime >= s.endTime) { toast.error("Giờ kết thúc phải sau giờ bắt đầu"); return; }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/extra-work-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "OVERTIME", slots, purpose: overtimePurpose }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã gửi đăng ký làm thêm ngoài giờ cho Kho mô");
      setSelected(null);
      setSlots([emptySlot()]);
      setOvertimePurpose(null);
      loadHistory();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary-strong" /> Đăng ký cấy thêm
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Dùng khi cấy nhanh hết chỉ định được giao hoặc muốn đăng ký làm thêm ngoài giờ/Chủ nhật — chỉ chọn được 1 trong 2 mục dưới đây.
          </p>
        </div>
      )}
      {hideHeader && (
        <p className="text-text-secondary text-sm">
          Dùng khi cấy nhanh hết chỉ định được giao hoặc muốn đăng ký làm thêm ngoài giờ/Chủ nhật — chỉ chọn được 1 trong 2 mục dưới đây.
        </p>
      )}

      {/* Bảng 1 — Hoàn thành sớm chỉ định được giao */}
      <Card className={selected === "OVERTIME" ? "opacity-50" : ""}>
        <CardHeader>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={selected === "EARLY_COMPLETION"}
              disabled={selected === "OVERTIME"}
              onCheckedChange={(checked) => setSelected(checked ? "EARLY_COMPLETION" : null)}
            />
            <CardTitle className="text-base">Hoàn thành sớm chỉ định được giao</CardTitle>
          </label>
        </CardHeader>
        {selected === "EARLY_COMPLETION" && (
          <CardContent className="space-y-3">
            <div className="space-y-1 max-w-sm">
              <Label className="text-xs">Thời gian dự kiến kết thúc chỉ định đang thực hiện</Label>
              <div className="flex gap-2">
                <Input type="date" min={format(today, "yyyy-MM-dd")} value={expectedEndDate} onChange={(e) => setExpectedEndDate(e.target.value)} />
                <Select items={[{ value: "SANG", label: "Buổi sáng" }, { value: "CHIEU", label: "Buổi chiều" }]} value={expectedEndSession} onValueChange={(v) => setExpectedEndSession(v as "SANG" | "CHIEU")}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SANG">Buổi sáng</SelectItem>
                    <SelectItem value="CHIEU">Buổi chiều</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submitEarlyCompletion}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Gửi thông báo
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Bảng 2 — Đăng ký làm thêm ngoài giờ */}
      <Card className={selected === "EARLY_COMPLETION" ? "opacity-50" : ""}>
        <CardHeader>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={selected === "OVERTIME"}
              disabled={selected === "EARLY_COMPLETION"}
              onCheckedChange={(checked) => setSelected(checked ? "OVERTIME" : null)}
            />
            <CardTitle className="text-base">Đăng ký làm thêm ngoài giờ</CardTitle>
          </label>
        </CardHeader>
        {selected === "OVERTIME" && (
          <CardContent className="space-y-3">
            <p className="text-xs text-text-secondary">
              Chỉ được chọn từ {format(addDays(today, 1), "dd/MM", { locale: vi })} đến hết Chủ nhật ({format(endOfWeek(today, { weekStartsOn: 1 }), "dd/MM", { locale: vi })}).
            </p>

            <div className="space-y-2">
              <Label className="text-xs">Lý do đăng ký (chọn 1 trong 2 — Kho mô xem thông tin này để quyết định duyệt)</Label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={overtimePurpose === "COMPLETE_MAIN_INSTRUCTION"}
                  disabled={overtimePurpose === "INCREASE_OUTPUT"}
                  onCheckedChange={(checked) => setOvertimePurpose(checked ? "COMPLETE_MAIN_INSTRUCTION" : null)}
                />
                <span className="text-sm">Đăng ký làm thêm để hoàn thành chỉ định cấy chính được giao trong tuần</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={overtimePurpose === "INCREASE_OUTPUT"}
                  disabled={overtimePurpose === "COMPLETE_MAIN_INSTRUCTION"}
                  onCheckedChange={(checked) => setOvertimePurpose(checked ? "INCREASE_OUTPUT" : null)}
                />
                <span className="text-sm">Đăng ký làm thêm để gia tăng sản lượng</span>
              </label>
            </div>

            <div className="space-y-2">
              {slots.map((slot, idx) => (
                <div key={idx} className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Ngày</Label>
                    <Input type="date" min={tomorrowStr} max={weekEndStr} value={slot.date} onChange={(e) => updateSlot(idx, "date", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Giờ bắt đầu</Label>
                    <Input type="time" value={slot.startTime} onChange={(e) => updateSlot(idx, "startTime", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Giờ kết thúc</Label>
                    <Input type="time" value={slot.endTime} onChange={(e) => updateSlot(idx, "endTime", e.target.value)} />
                  </div>
                  {slots.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" className="h-9 px-2 text-destructive" onClick={() => removeSlotRow(idx)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addSlotRow}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Thêm hàng
            </Button>
            <div>
              <Button className="bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submitOvertime}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Gửi đăng ký
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lịch sử đăng ký</CardTitle></CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">Chưa có đăng ký nào</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-start justify-between gap-3 border-b border-divider py-2.5 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {h.type === "EARLY_COMPLETION" ? "Hoàn thành sớm chỉ định" : "Làm thêm ngoài giờ"}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {h.type === "EARLY_COMPLETION"
                        ? `${h.instruction?.code ?? "—"} — dự kiến ${h.expectedEndSession ? WORK_SESSION_LABELS[h.expectedEndSession].toLowerCase() : ""} ${h.expectedEndDate ? format(new Date(h.expectedEndDate), "dd/MM/yyyy", { locale: vi }) : ""}`
                        : h.slots.map((s) => `${format(new Date(s.date), "dd/MM", { locale: vi })} (${s.startTime}-${s.endTime})`).join(", ")}
                    </p>
                    {h.type === "OVERTIME" && h.purpose && (
                      <p className="text-xs text-text-muted">{EXTRA_WORK_PURPOSE_LABELS[h.purpose]}</p>
                    )}
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[h.status]} className="shrink-0">{EXTRA_WORK_REQUEST_STATUS_LABELS[h.status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
