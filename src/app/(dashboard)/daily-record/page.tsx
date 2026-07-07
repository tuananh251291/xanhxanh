"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PenLine, Loader2, Lock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, isSameDay, startOfWeek, differenceInCalendarDays } from "date-fns";

// Tiến độ cấy tính theo 6 ngày làm việc (Thứ 2 - Thứ 7) — Chủ nhật là ngày làm thêm tùy chọn nên
// không cộng thêm chỉ tiêu (chặn mức chỉ tiêu ở đúng bằng chỉ tiêu Thứ 7 = tổng dự kiến cả tuần).
const WORKING_DAYS_PER_WEEK = 6;
type StageKey = "m03" | "m05" | "t05" | "t01";
const STAGE_KEYS: StageKey[] = ["m03", "m05", "t05", "t01"];

type InstructionItem = { stageCode: string | null; expectedMotherOutput: number | null };
type Instruction = {
  id: string;
  code: string;
  plantType: { name: string };
  weekStart: string | null;
  inputMotherQuantity: number;
  plannedT01Quantity: number | null;
  plannedT05Quantity: number | null;
  items: InstructionItem[];
};

type RecordItem = { stage: "MAU_ME" | "THANH_PHAM"; quantityCreated: number; lot: { stageCode: string } };
type DailyRecord = {
  id: string;
  recordDate: string;
  motherUsed: number;
  motherChecked: number;
  motherContaminatedM03: number;
  motherContaminatedM05: number;
  items: RecordItem[];
};

const DAY_LABELS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

type FormState = {
  motherChecked: string;
  motherContaminatedM03: string;
  motherContaminatedM05: string;
  motherUsed: string;
  m03: string;
  m05: string;
  t05: string;
  t01: string;
};

const emptyForm: FormState = {
  motherChecked: "0", motherContaminatedM03: "0", motherContaminatedM05: "0", motherUsed: "0",
  m03: "0", m05: "0", t05: "0", t01: "0",
};

// Chỉ để dạng điền số thuần, ẩn nút bấm tăng/giảm mặc định của trình duyệt.
const NUMBER_INPUT_CLASS = "w-20 text-right ml-auto [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("vi-VN"));
const renderPercent = (actual: number, plan: number | null | undefined) => {
  if (plan === null || plan === undefined || plan === 0) return "—";
  return `${Math.round((actual / plan) * 100)}%`;
};

export default function DailyRecordPage() {
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [targetPct, setTargetPct] = useState(80);

  const today = useMemo(() => new Date(), []);
  const currentWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: { key: string; value: string }[]) => {
        const found = data.find((c) => c.key === "planting_ratio_target_pct");
        if (found) setTargetPct(parseFloat(found.value) || 80);
      });
  }, []);

  useEffect(() => {
    fetch("/api/instructions?status=ACTIVE")
      .then((r) => r.json())
      .then((data: Instruction[]) => {
        const list = Array.isArray(data) ? data : [];
        const inWeek = list.filter(
          (inst) => inst.weekStart && isSameDay(startOfWeek(new Date(inst.weekStart), { weekStartsOn: 1 }), currentWeekStart)
        );
        setInstructions(inWeek);
        setSelectedId((prev) => (prev && inWeek.some((i) => i.id === prev) ? prev : (inWeek[0]?.id ?? "")));
      });
  }, [currentWeekStart]);

  useEffect(() => {
    if (!selectedId) { setRecords([]); return; }
    setLoading(true);
    fetch(`/api/daily-records?instructionId=${selectedId}`)
      .then((r) => r.json())
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const selectedInst = instructions.find((i) => i.id === selectedId);

  const recordForDay = (day: Date) => records.find((r) => isSameDay(new Date(r.recordDate), day));

  const rowValues = (rec: DailyRecord) => {
    const sum = (code: string) => rec.items.filter((i) => i.lot.stageCode === code).reduce((s, i) => s + i.quantityCreated, 0);
    return {
      motherChecked: rec.motherChecked,
      motherContaminatedM03: rec.motherContaminatedM03,
      motherContaminatedM05: rec.motherContaminatedM05,
      motherUsed: rec.motherUsed,
      m03: sum("M03"),
      m05: sum("M05"),
      t05: sum("T05"),
      t01: sum("T01"),
    };
  };

  // Hàng 9: tổng thực tế — chỉ cộng các ngày đã có bản ghi (không thể có ngày tương lai vì mỗi ngày
  // chỉ nhập được đúng vào dòng của ngày hôm đó), nên đây luôn là tổng tính tới thời điểm hiện tại.
  const totals = records.reduce(
    (acc, rec) => {
      const v = rowValues(rec);
      acc.motherChecked += v.motherChecked;
      acc.motherContaminatedM03 += v.motherContaminatedM03;
      acc.motherContaminatedM05 += v.motherContaminatedM05;
      acc.motherUsed += v.motherUsed;
      acc.m03 += v.m03;
      acc.m05 += v.m05;
      acc.t05 += v.t05;
      acc.t01 += v.t01;
      return acc;
    },
    { motherChecked: 0, motherContaminatedM03: 0, motherContaminatedM05: 0, motherUsed: 0, m03: 0, m05: 0, t05: 0, t01: 0 }
  );

  // Hàng 10: số dự kiến của NV kỹ thuật đưa ra theo chỉ định cấy — MM đã kiểm tra/MM mẹ nhiễm không
  // có số dự kiến tương ứng.
  const expected = selectedInst
    ? {
        motherUsed: selectedInst.inputMotherQuantity,
        m03: selectedInst.items.filter((i) => i.stageCode === "M03").reduce((s, i) => s + (i.expectedMotherOutput ?? 0), 0),
        m05: selectedInst.items.filter((i) => i.stageCode === "M05").reduce((s, i) => s + (i.expectedMotherOutput ?? 0), 0),
        t05: selectedInst.plannedT05Quantity ?? 0,
        t01: selectedInst.plannedT01Quantity ?? 0,
      }
    : null;

  // Tiến độ lũy kế tới hôm nay so với chỉ tiêu trung bình/ngày (dự kiến cả tuần / 6 ngày) — chỉ cần 1
  // quy cách hụt dưới "Tỉ lệ cấy cần đạt" (targetPct, Admin cấu hình) là coi như cấy lệch chỉ định.
  const elapsedDays = Math.min(differenceInCalendarDays(today, currentWeekStart) + 1, WORKING_DAYS_PER_WEEK);
  const expectedToDate = expected
    ? {
        motherUsed: (expected.motherUsed / WORKING_DAYS_PER_WEEK) * elapsedDays,
        m03: (expected.m03 / WORKING_DAYS_PER_WEEK) * elapsedDays,
        m05: (expected.m05 / WORKING_DAYS_PER_WEEK) * elapsedDays,
        t05: (expected.t05 / WORKING_DAYS_PER_WEEK) * elapsedDays,
        t01: (expected.t01 / WORKING_DAYS_PER_WEEK) * elapsedDays,
      }
    : null;
  const behindStages = expected
    ? STAGE_KEYS.filter((key) => {
        const target = expected[key];
        if (!target) return false;
        return totals[key] / expectedToDate![key] < targetPct / 100;
      })
    : [];

  const todayRecord = recordForDay(today);

  // Tổng MM đã kiểm tra lũy kế (các ngày đã lưu + số đang nhập hôm nay) không được vượt quá số mẫu mẹ
  // được cấp cho chỉ định (inputMotherQuantity) — chặn nút Lưu nếu vượt, khớp validate ở API.
  const cumulativeMotherChecked = totals.motherChecked + (Number(form.motherChecked) || 0);
  const motherCheckedExceeded = !!selectedInst && !todayRecord && cumulativeMotherChecked > selectedInst.inputMotherQuantity;

  const onSubmitToday = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/daily-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructionId: selectedId,
          motherChecked: Number(form.motherChecked) || 0,
          motherContaminatedM03: Number(form.motherContaminatedM03) || 0,
          motherContaminatedM05: Number(form.motherContaminatedM05) || 0,
          motherUsed: Number(form.motherUsed) || 0,
          m03: Number(form.m03) || 0,
          m05: Number(form.m05) || 0,
          t05: Number(form.t05) || 0,
          t01: Number(form.t01) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Lưu dữ liệu hôm nay thành công!");
      if (json.alert) toast.warning("⚠️ Bạn đang cấy lệch tiến độ so với chỉ định — đã gửi cảnh báo cho KY_THUAT");
      if (json.ended) {
        toast.info(
          json.endReason === "MOTHER_USED_UP"
            ? "🏁 Chỉ định đã kết thúc — đã dùng hết số mẫu mẹ được cấp"
            : "🏁 Chỉ định đã kết thúc — hết thời gian thực hiện (qua Chủ nhật). Xem 'Chỉ định của tôi' để bàn giao MM dư nếu còn."
        );
      }
      setForm(emptyForm);
      const [instRes, recRes] = await Promise.all([
        fetch("/api/instructions?status=ACTIVE"),
        fetch(`/api/daily-records?instructionId=${selectedId}`),
      ]);
      const instData: Instruction[] = await instRes.json();
      const inWeek = (Array.isArray(instData) ? instData : []).filter(
        (inst) => inst.weekStart && isSameDay(startOfWeek(new Date(inst.weekStart), { weekStartsOn: 1 }), currentWeekStart)
      );
      setInstructions(inWeek);
      setRecords(await recRes.json());
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      // MM sử dụng mặc định = MM đã kiểm tra - tổng MM nhiễm (M03+M05), tự tính lại mỗi khi 1 trong 3
      // số này đổi.
      if (key === "motherChecked" || key === "motherContaminatedM03" || key === "motherContaminatedM05") {
        const checked = Number(key === "motherChecked" ? value : f.motherChecked) || 0;
        const contaminatedM03 = Number(key === "motherContaminatedM03" ? value : f.motherContaminatedM03) || 0;
        const contaminatedM05 = Number(key === "motherContaminatedM05" ? value : f.motherContaminatedM05) || 0;
        next.motherUsed = String(Math.max(0, checked - contaminatedM03 - contaminatedM05));
      }
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PenLine className="w-6 h-6 text-primary-strong" /> Nhập dữ liệu cấy
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Ghi nhận sản lượng theo tuần thực tế — mỗi ngày chỉ nhập vào dòng của ngày hôm đó, đã lưu không sửa được
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="space-y-1 max-w-md">
            <label className="text-sm font-medium">Chỉ định cấy (tuần thực tế)</label>
            {instructions.length === 0 ? (
              <p className="text-sm text-text-secondary">Không có chỉ định cấy nào của bạn trong tuần này.</p>
            ) : (
              <Select
                items={instructions.map((inst) => ({ value: inst.id, label: `${inst.code} — ${inst.plantType.name}` }))}
                value={selectedId || undefined}
                onValueChange={(v) => setSelectedId(v as string)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chỉ định cấy" />
                </SelectTrigger>
                <SelectContent>
                  {instructions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.code} — {inst.plantType.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedInst && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Bảng nhập liệu tuần ({format(currentWeekStart, "dd/MM")} – {format(addDays(currentWeekStart, 6), "dd/MM")})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light text-primary-strong">
                      <th className="px-3 py-2 text-left whitespace-nowrap font-bold text-base">Ngày</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM đã kiểm tra</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM nhiễm M03</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM nhiễm M05</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM sử dụng</th>
                      <th className="px-3 py-2 text-right font-bold text-base">M03</th>
                      <th className="px-3 py-2 text-right font-bold text-base">M05</th>
                      <th className="px-3 py-2 text-right font-bold text-base">T05</th>
                      <th className="px-3 py-2 text-right font-bold text-base">T01</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day, idx) => {
                      const rec = recordForDay(day);
                      const values = rec ? rowValues(rec) : null;
                      const isToday = isSameDay(day, today);
                      const isEditableRow = isToday && !rec;
                      return (
                        <tr key={day.toISOString()} className={`border-b ${isToday ? "bg-primary-light" : idx % 2 === 0 ? "bg-primary-light/60" : "bg-white"}`}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {DAY_LABELS[idx]} - {format(day, "dd/MM")}
                            {isToday && <span className="ml-1 text-xs text-primary-strong">(hôm nay)</span>}
                          </td>
                          {isEditableRow ? (
                            <>
                              <td className="px-2 py-2"><Input type="number" min={0} className={NUMBER_INPUT_CLASS} value={form.motherChecked} onChange={setField("motherChecked")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} className={NUMBER_INPUT_CLASS} value={form.motherContaminatedM03} onChange={setField("motherContaminatedM03")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} className={NUMBER_INPUT_CLASS} value={form.motherContaminatedM05} onChange={setField("motherContaminatedM05")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} className={NUMBER_INPUT_CLASS} value={form.motherUsed} onChange={setField("motherUsed")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} className={NUMBER_INPUT_CLASS} value={form.m03} onChange={setField("m03")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} className={NUMBER_INPUT_CLASS} value={form.m05} onChange={setField("m05")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} className={NUMBER_INPUT_CLASS} value={form.t05} onChange={setField("t05")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} className={NUMBER_INPUT_CLASS} value={form.t01} onChange={setField("t01")} /></td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherChecked) : "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherContaminatedM03) : "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherContaminatedM05) : "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherUsed) : "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.m03) : "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.m05) : "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.t05) : "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.t01) : "—"}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    <tr className="border-b bg-info-light font-semibold">
                      <td className="px-3 py-2">Tổng thực tế đến thời điểm hiện tại</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.motherChecked)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.motherContaminatedM03)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.motherContaminatedM05)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.motherUsed)}</td>
                      <td className={`px-3 py-2 text-right ${behindStages.includes("m03") ? "text-destructive" : ""}`}>{fmt(totals.m03)}</td>
                      <td className={`px-3 py-2 text-right ${behindStages.includes("m05") ? "text-destructive" : ""}`}>{fmt(totals.m05)}</td>
                      <td className={`px-3 py-2 text-right ${behindStages.includes("t05") ? "text-destructive" : ""}`}>{fmt(totals.t05)}</td>
                      <td className={`px-3 py-2 text-right ${behindStages.includes("t01") ? "text-destructive" : ""}`}>{fmt(totals.t01)}</td>
                    </tr>
                    <tr className="border-b bg-warning-light font-semibold">
                      <td className="px-3 py-2">Tổng dự kiến cần đạt đến thời điểm hiện tại</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">{expectedToDate ? fmt(Math.round(expectedToDate.motherUsed)) : "—"}</td>
                      <td className="px-3 py-2 text-right">{expectedToDate ? fmt(Math.round(expectedToDate.m03)) : "—"}</td>
                      <td className="px-3 py-2 text-right">{expectedToDate ? fmt(Math.round(expectedToDate.m05)) : "—"}</td>
                      <td className="px-3 py-2 text-right">{expectedToDate ? fmt(Math.round(expectedToDate.t05)) : "—"}</td>
                      <td className="px-3 py-2 text-right">{expectedToDate ? fmt(Math.round(expectedToDate.t01)) : "—"}</td>
                    </tr>
                    {behindStages.length > 0 && (
                      <tr className="border-b bg-danger-light">
                        <td colSpan={9} className="px-3 py-2 text-sm font-bold text-destructive">
                          <span className="flex items-center gap-1.5">
                            <TriangleAlert className="w-4 h-4 shrink-0" />
                            Bạn đang cấy lệch so với chỉ định cấy — Xem lại phần số màu đỏ
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr className="border-b bg-background font-semibold">
                      <td className="px-3 py-2">Tổng dự kiến cần đạt đến hết tuần</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">{fmt(expected?.motherUsed)}</td>
                      <td className="px-3 py-2 text-right">{fmt(expected?.m03)}</td>
                      <td className="px-3 py-2 text-right">{fmt(expected?.m05)}</td>
                      <td className="px-3 py-2 text-right">{fmt(expected?.t05)}</td>
                      <td className="px-3 py-2 text-right">{fmt(expected?.t01)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="px-3 py-2">% hoàn thành</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">{renderPercent(totals.motherUsed, expected?.motherUsed)}</td>
                      <td className="px-3 py-2 text-right">{renderPercent(totals.m03, expected?.m03)}</td>
                      <td className="px-3 py-2 text-right">{renderPercent(totals.m05, expected?.m05)}</td>
                      <td className="px-3 py-2 text-right">{renderPercent(totals.t05, expected?.t05)}</td>
                      <td className="px-3 py-2 text-right">{renderPercent(totals.t01, expected?.t01)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {todayRecord ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-text-secondary bg-background rounded p-3">
                <Lock className="w-4 h-4" /> Đã nhập dữ liệu cho hôm nay — không thể sửa lại.
              </div>
            ) : (
              <>
                {motherCheckedExceeded && (
                  <div className="mt-4 flex items-center gap-2 text-sm font-medium text-destructive bg-danger-light rounded p-3">
                    <TriangleAlert className="w-4 h-4 shrink-0" />
                    Tổng MM đã kiểm tra ({fmt(cumulativeMotherChecked)}) vượt quá số mẫu mẹ được cấp cho chỉ định
                    ({fmt(selectedInst?.inputMotherQuantity)}) — không thể lưu.
                  </div>
                )}
                <Button
                  className="mt-4 w-full bg-primary hover:bg-primary-hover"
                  disabled={submitting || loading || motherCheckedExceeded}
                  onClick={onSubmitToday}
                >
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Lưu dữ liệu hôm nay
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
