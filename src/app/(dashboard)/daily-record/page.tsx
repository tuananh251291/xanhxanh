"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PenLine, Loader2, Lock, TriangleAlert, Info } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, isSameDay, startOfWeek } from "date-fns";

// Cùng định dạng hệ số mà KY_THUAT dùng lúc nhập "Tỉ lệ nhân MM"/"Tỉ lệ ra TP" lúc tạo chỉ định (xem
// fmtRatio ở instructions/[id]/page.tsx) — số cụm/cây ra trên 1 đơn vị MM dùng, không phải %.
const formatRatio = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

type InstructionItem = { stageCode: string | null; expectedMotherOutput: number | null };
type Instruction = {
  id: string;
  code: string;
  plantType: { name: string };
  weekStart: string | null;
  inputMotherQuantity: number;
  expectedFinishedOutput: number | null;
  plannedT01Quantity: number | null;
  plannedT05Quantity: number | null;
  motherReceivedAt: string | null;
  items: InstructionItem[];
};

type RecordItem = { stage: "MAU_ME" | "THANH_PHAM"; quantityCreated: number; lot: { stageCode: string } };
type DailyRecord = {
  id: string;
  recordDate: string;
  motherUsed: number;
  motherChecked: number;
  motherContaminatedM05: number;
  items: RecordItem[];
};

const DAY_LABELS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

type FormState = {
  motherChecked: string;
  motherContaminatedM05: string;
  motherUsed: string;
  m05: string;
  t05: string;
  t01: string;
};

// Để trống (không mặc định "0") cho các ô nhập tay — dễ gõ nhầm nếu có sẵn "0" (VD gõ "5" thành "05"
// rồi quên xoá số 0 cũ). Chỉ ô "MM đã kiểm tra" (tự tính, khoá không cho gõ) mới giữ "0" thật vì nó luôn
// hiện đúng kết quả tính toán, không phải chỗ chờ người dùng gõ.
const emptyForm: FormState = {
  motherChecked: "0", motherContaminatedM05: "", motherUsed: "",
  m05: "", t05: "", t01: "",
};

// Chỉ để dạng điền số thuần, ẩn nút bấm tăng/giảm mặc định của trình duyệt.
const NUMBER_INPUT_CLASS = "w-20 text-right ml-auto [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("vi-VN"));

export default function DailyRecordPage() {
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [motherRatioTargetPct, setMotherRatioTargetPct] = useState(80);
  const [finishedRatioTargetPct, setFinishedRatioTargetPct] = useState(80);

  const today = useMemo(() => new Date(), []);
  const currentWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: { key: string; value: string }[]) => {
        const mother = data.find((c) => c.key === "mother_ratio_target_pct");
        if (mother) setMotherRatioTargetPct(parseFloat(mother.value) || 80);
        const finished = data.find((c) => c.key === "finished_ratio_target_pct");
        if (finished) setFinishedRatioTargetPct(parseFloat(finished.value) || 80);
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
        // Chỉ những chỉ định ĐÃ xác nhận nhận mẫu mẹ mới được chọn để nhập dữ liệu — chưa xác nhận thì
        // API cũng chặn (xem POST /api/daily-records), ẩn hẳn ở đây để NV không bấm nhầm rồi mới báo lỗi.
        const confirmed = inWeek.filter((i) => i.motherReceivedAt);
        setSelectedId((prev) => (prev && confirmed.some((i) => i.id === prev) ? prev : (confirmed[0]?.id ?? "")));
      });
  }, [currentWeekStart]);

  useEffect(() => {
    if (!selectedId) {
      Promise.resolve().then(() => setRecords([]));
      return;
    }
    Promise.resolve().then(() => setLoading(true));
    fetch(`/api/daily-records?instructionId=${selectedId}`)
      .then((r) => r.json())
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const confirmedInstructions = instructions.filter((i) => i.motherReceivedAt);
  const hasUnconfirmed = instructions.length > confirmedInstructions.length;
  const selectedInst = instructions.find((i) => i.id === selectedId);

  const recordForDay = (day: Date) => records.find((r) => isSameDay(new Date(r.recordDate), day));

  const rowValues = (rec: DailyRecord) => {
    const sum = (code: string) => rec.items.filter((i) => i.lot.stageCode === code).reduce((s, i) => s + i.quantityCreated, 0);
    return {
      motherChecked: rec.motherChecked,
      motherContaminatedM05: rec.motherContaminatedM05,
      motherUsed: rec.motherUsed,
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
      acc.motherContaminatedM05 += v.motherContaminatedM05;
      acc.motherUsed += v.motherUsed;
      acc.m05 += v.m05;
      acc.t05 += v.t05;
      acc.t01 += v.t01;
      return acc;
    },
    { motherChecked: 0, motherContaminatedM05: 0, motherUsed: 0, m05: 0, t05: 0, t01: 0 }
  );

  const todayRecord = recordForDay(today);

  // Tỉ lệ nhân MM (số cụm mẫu mẹ thành phẩm quy đổi / số mẫu mẹ đã sử dụng) và tỉ lệ ra thành phẩm (số
  // cây ra rễ thành phẩm / số mẫu mẹ đã sử dụng), cộng dồn cả chỉ định + số đang nhập hôm nay (nếu chưa
  // lưu) — so với tỉ lệ mục tiêu của chính chỉ định này (suy từ motherSampleRatio/rootingRatio KY_THUAT
  // nhập lúc tạo chỉ định). Cả 2 tỉ lệ cùng thấp hơn ngưỡng % Admin cấu hình mới coi là nghi cấy sai chỉ
  // định — khớp đúng thuật toán server ở /api/daily-records.
  const pendingMotherUsed = !todayRecord ? Number(form.motherUsed) || 0 : 0;
  const pendingM05 = !todayRecord ? Number(form.m05) || 0 : 0;
  const pendingT05 = !todayRecord ? Number(form.t05) || 0 : 0;
  const pendingT01 = !todayRecord ? Number(form.t01) || 0 : 0;

  const projectedMotherUsed = totals.motherUsed + pendingMotherUsed;
  // m05 (số lô mẫu mẹ tạo ra hôm nay) đã tính thẳng theo cụm — không cần quy đổi thêm.
  const projectedMotherClusters = totals.m05 + pendingM05;
  const projectedFinished = totals.t05 + totals.t01 + pendingT05 + pendingT01;

  const targetMotherOutputClusters = selectedInst
    ? selectedInst.items
        .filter((i) => i.stageCode === "M05")
        .reduce((s, i) => s + (i.expectedMotherOutput ?? 0), 0)
    : 0;
  const targetMotherRatio = selectedInst && selectedInst.inputMotherQuantity > 0 ? targetMotherOutputClusters / selectedInst.inputMotherQuantity : 0;
  const targetFinishedRatio =
    selectedInst && selectedInst.inputMotherQuantity > 0 ? (selectedInst.expectedFinishedOutput ?? 0) / selectedInst.inputMotherQuantity : 0;

  const hasMotherUsedData = projectedMotherUsed > 0;
  const actualMotherRatio = hasMotherUsedData ? projectedMotherClusters / projectedMotherUsed : 0;
  const actualFinishedRatio = hasMotherUsedData ? projectedFinished / projectedMotherUsed : 0;
  const motherRatioPct = targetMotherRatio > 0 ? (actualMotherRatio / targetMotherRatio) * 100 : null;
  const finishedRatioPct = targetFinishedRatio > 0 ? (actualFinishedRatio / targetFinishedRatio) * 100 : null;
  const motherRatioLow = motherRatioPct !== null && motherRatioPct < motherRatioTargetPct;
  const finishedRatioLow = finishedRatioPct !== null && finishedRatioPct < finishedRatioTargetPct;
  // Chỉ định có thể chỉ có mục tiêu 1 trong 2 tỉ lệ (bên kia để trống) — tỉ lệ nào không có mục tiêu thì
  // bỏ qua, không bắt buộc đủ cả 2 mới cảnh báo (khớp thuật toán server ở /api/daily-records).
  const hasAnyTargetRatio = motherRatioPct !== null || finishedRatioPct !== null;
  const allAvailableRatiosLow = (motherRatioPct === null || motherRatioLow) && (finishedRatioPct === null || finishedRatioLow);
  const isDeviating = !!selectedInst && projectedMotherUsed > 0 && hasAnyTargetRatio && allAvailableRatiosLow;

  // Tổng MM đã kiểm tra lũy kế (các ngày đã lưu + số đang nhập hôm nay) không được vượt quá số mẫu mẹ
  // được cấp cho chỉ định (inputMotherQuantity) — chặn nút Lưu nếu vượt, khớp validate ở API.
  const cumulativeMotherChecked = totals.motherChecked + (Number(form.motherChecked) || 0);
  const motherCheckedExceeded = !!selectedInst && !todayRecord && cumulativeMotherChecked > selectedInst.inputMotherQuantity;

  const onSubmitToday = async () => {
    if (!selectedId) return;
    // Đã lưu là KHÔNG sửa lại được nữa (chỉ Admin mới sửa được sau này) — bắt buộc dừng lại xác nhận
    // trước khi ghi, đặc biệt nhắc rõ đơn vị vì hay nhầm cụm/túi.
    if (!window.confirm("Hãy kiểm tra lại số liệu trước khi cập nhật — dữ liệu đã lưu sẽ KHÔNG tự sửa lại được.\n\nLưu ý: các ô số lượng đang nhập là SỐ CỤM, không phải số túi.")) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/daily-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructionId: selectedId,
          motherChecked: Number(form.motherChecked) || 0,
          motherContaminatedM05: Number(form.motherContaminatedM05) || 0,
          motherUsed: Number(form.motherUsed) || 0,
          m05: Number(form.m05) || 0,
          t05: Number(form.t05) || 0,
          t01: Number(form.t01) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Lưu dữ liệu hôm nay thành công!");
      if (json.alert) {
        // Chỉ liệt kê tỉ lệ nào chỉ định THỰC SỰ có mục tiêu (targetRatio > 0) — chỉ định thiếu 1 trong 2
        // tỉ lệ (bên kia để trống lúc tạo) thì toast cũng chỉ nói đúng tỉ lệ có mục tiêu.
        const deviationParts: string[] = [];
        if (json.targetMotherRatio > 0) deviationParts.push(`tỉ lệ nhân MM đạt ${formatRatio(json.actualMotherRatio)} (chỉ định ${formatRatio(json.targetMotherRatio)})`);
        if (json.targetFinishedRatio > 0) deviationParts.push(`tỉ lệ ra thành phẩm đạt ${formatRatio(json.actualFinishedRatio)} (chỉ định ${formatRatio(json.targetFinishedRatio)})`);
        toast.warning(`⚠️ Cấy lệch chỉ định — ${deviationParts.join(", ")} — đã gửi cảnh báo cho KY_THUAT`);
      }
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
      setSelectedId((prev) => (prev && inWeek.some((i) => i.id === prev && i.motherReceivedAt) ? prev : (inWeek.find((i) => i.motherReceivedAt)?.id ?? "")));
      setRecords(await recRes.json());
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      // MM đã kiểm tra KHÔNG tự nhập — luôn tự tính = MM nhiễm + MM sử dụng mỗi khi 1 trong 2 số này đổi.
      if (key === "motherUsed" || key === "motherContaminatedM05") {
        const used = Number(key === "motherUsed" ? value : f.motherUsed) || 0;
        const contaminatedM05 = Number(key === "motherContaminatedM05" ? value : f.motherContaminatedM05) || 0;
        next.motherChecked = String(used + contaminatedM05);
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
            {confirmedInstructions.length === 0 ? (
              <p className="text-sm text-text-secondary">
                {hasUnconfirmed
                  ? "Bạn có chỉ định tuần này nhưng chưa xác nhận nhận mẫu mẹ — vào \"Chỉ định của tôi\" để xác nhận trước khi nhập dữ liệu."
                  : "Không có chỉ định cấy nào của bạn trong tuần này."}
              </p>
            ) : (
              <Select
                items={confirmedInstructions.map((inst) => ({ value: inst.id, label: `${inst.code} — ${inst.plantType.name}` }))}
                value={selectedId}
                onValueChange={(v) => setSelectedId(v as string)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chỉ định cấy" />
                </SelectTrigger>
                <SelectContent>
                  {confirmedInstructions.map((inst) => (
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
            {!todayRecord && (
              <div className="mb-3 text-sm text-info-foreground bg-info-light rounded-lg p-3 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p>1. MM đã kiểm tra = MM nhiễm + MM sử dụng</p>
                  <p>2. Số điền là cây hoặc cụm, không phải số túi</p>
                </div>
              </div>
            )}
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light text-primary-strong">
                      <th className="px-3 py-2 text-left whitespace-nowrap font-bold text-base">Ngày</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM nhiễm (cụm)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM sử dụng (cụm)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM đã kiểm tra (cụm)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">M05 (cụm)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">T05 (cây)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">T01 (cây)</th>
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
                              <td className="px-2 py-2"><Input type="number" min={0} placeholder="_" className={NUMBER_INPUT_CLASS} value={form.motherContaminatedM05} onChange={setField("motherContaminatedM05")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} placeholder="_" className={NUMBER_INPUT_CLASS} value={form.motherUsed} onChange={setField("motherUsed")} /></td>
                              <td className="px-2 py-2"><Input type="number" disabled className={NUMBER_INPUT_CLASS} value={form.motherChecked} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} placeholder="_" className={NUMBER_INPUT_CLASS} value={form.m05} onChange={setField("m05")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} placeholder="_" className={NUMBER_INPUT_CLASS} value={form.t05} onChange={setField("t05")} /></td>
                              <td className="px-2 py-2"><Input type="number" min={0} placeholder="_" className={NUMBER_INPUT_CLASS} value={form.t01} onChange={setField("t01")} /></td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherContaminatedM05) : "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherUsed) : "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherChecked) : "—"}</td>
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
                      <td className="px-3 py-2 text-right">{fmt(totals.motherContaminatedM05)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.motherUsed)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.motherChecked)}</td>
                      <td className={`px-3 py-2 text-right ${motherRatioLow ? "text-destructive" : ""}`}>{fmt(totals.m05)}</td>
                      <td className={`px-3 py-2 text-right ${finishedRatioLow ? "text-destructive" : ""}`}>{fmt(totals.t05)}</td>
                      <td className={`px-3 py-2 text-right ${finishedRatioLow ? "text-destructive" : ""}`}>{fmt(totals.t01)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {selectedInst && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`rounded-lg p-3 ${motherRatioLow ? "bg-danger-light" : "bg-background"}`}>
                  <p className="text-xs text-text-secondary">Hệ số nhân MM (cụm MM thành phẩm / MM sử dụng)</p>
                  <p className={`text-lg font-bold ${motherRatioLow ? "text-destructive" : "text-foreground"}`}>
                    {hasMotherUsedData ? formatRatio(actualMotherRatio) : "—"}
                    <span className="text-xs font-normal text-text-secondary ml-1">(chỉ định giao: {formatRatio(targetMotherRatio)})</span>
                  </p>
                </div>
                <div className={`rounded-lg p-3 ${finishedRatioLow ? "bg-danger-light" : "bg-background"}`}>
                  <p className="text-xs text-text-secondary">Hệ số ra thành phẩm (cây ra rễ / MM sử dụng)</p>
                  <p className={`text-lg font-bold ${finishedRatioLow ? "text-destructive" : "text-foreground"}`}>
                    {hasMotherUsedData ? formatRatio(actualFinishedRatio) : "—"}
                    <span className="text-xs font-normal text-text-secondary ml-1">(chỉ định giao: {formatRatio(targetFinishedRatio)})</span>
                  </p>
                </div>
              </div>
            )}

            {isDeviating && (
              <div className="mt-3 flex items-center gap-2 text-sm font-bold text-destructive bg-danger-light rounded p-3">
                <TriangleAlert className="w-4 h-4 shrink-0" />
                Bạn đang cấy lệch so với chỉ định cấy — {motherRatioPct !== null && finishedRatioPct !== null
                  ? "cả 2 tỉ lệ trên đều thấp hơn ngưỡng cần đạt"
                  : "tỉ lệ có mục tiêu ở trên đang thấp hơn ngưỡng cần đạt"}
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
                    Tổng MM đã kiểm tra ({fmt(cumulativeMotherChecked)} cụm) vượt quá số mẫu mẹ được cấp cho chỉ định
                    ({fmt(selectedInst?.inputMotherQuantity)} cụm) — không thể lưu.
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
