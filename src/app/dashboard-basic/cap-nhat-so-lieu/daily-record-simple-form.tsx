"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Lock, TriangleAlert, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { isSameDay, startOfWeek } from "date-fns";
import EndInstructionEarlyButton from "@/app/(dashboard)/daily-record/end-instruction-early-button";
import RepackInstructionPanel from "@/app/(dashboard)/daily-record/repack-instruction-panel";

type InstructionItem = { stageCode: string | null; expectedMotherOutput: number | null };
type VariantPlantType = { id: string; code: string; name: string };
type Instruction = {
  id: string;
  code: string;
  // Nhóm biến thể (đột biến) của mã cây chỉ định — có VÀ có >1 thành viên mới hiện được checkbox "Phát
  // sinh cây cần phân loại" (xem PlantType.variantGroupId, /plant-types).
  plantType: { name: string; variantGroup: { id: string; members: VariantPlantType[] } | null };
  weekStart: string | null;
  inputMotherQuantity: number;
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

// MM đã kiểm tra KHÔNG tự nhập — luôn tự tính = MM nhiễm + MM sử dụng (xem setField), chỉ hiển thị.
const FIELD_ROWS: { key: keyof FormState; label: string; editable: boolean }[] = [
  { key: "motherContaminatedM05", label: "MM nhiễm (cụm)", editable: true },
  { key: "motherUsed", label: "MM sử dụng (cụm)", editable: true },
  { key: "motherChecked", label: "MM đã kiểm tra (cụm)", editable: false },
  { key: "m05", label: "M05 mới cấy (cụm)", editable: true },
  { key: "t05", label: "T05 thành phẩm (cây)", editable: true },
  { key: "t01", label: "T01 thành phẩm (cây)", editable: true },
];

const NUMBER_INPUT_CLASS = "w-24 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const fmt = (n: number) => n.toLocaleString("vi-VN");
// Cùng định dạng hệ số mà KY_THUAT dùng lúc nhập "Tỉ lệ nhân MM"/"Tỉ lệ ra TP" lúc tạo chỉ định (xem
// fmtRatio ở instructions/[id]/page.tsx) — số cụm/cây ra trên 1 đơn vị MM dùng, không phải %.
const formatRatio = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

export default function DailyRecordSimpleForm() {
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  // "Phát sinh cây cần phân loại" — theo TỪNG NGÀY (reset mỗi khi đổi chỉ định/sau khi lưu).
  const [showVariantSplit, setShowVariantSplit] = useState(false);
  const [variantQty, setVariantQty] = useState<Record<string, { m05: string; t05: string; t01: string }>>({});
  // Hỏi "làm thêm Chủ nhật không" ngay sau khi lưu dữ liệu Thứ 7 (nếu chỉ định chưa tự kết thúc luôn qua
  // lần lưu này) — trả lời "Không" thì kết thúc sớm chỉ định luôn (giống bấm "Kết thúc chỉ định sớm"),
  // để "Bàn giao MM dư" biết cần nhắc NV bàn giao nếu còn dư — xem POST /api/daily-records (Thứ 7/CN mới
  // tự kết thúc được, không có cơ chế quét nền).
  const [showSundayPrompt, setShowSundayPrompt] = useState(false);
  const [confirmingSunday, setConfirmingSunday] = useState(false);

  const today = useMemo(() => new Date(), []);
  const currentWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);

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
        setLoading(false);
      });
  }, [currentWeekStart]);

  useEffect(() => {
    if (!selectedId) {
      Promise.resolve().then(() => setRecords([]));
      return;
    }
    fetch(`/api/daily-records?instructionId=${selectedId}`)
      .then((r) => r.json())
      .then((data) => setRecords(Array.isArray(data) ? data : []));
  }, [selectedId]);

  const confirmedInstructions = instructions.filter((i) => i.motherReceivedAt);
  const hasUnconfirmed = instructions.length > confirmedInstructions.length;
  const selectedInst = instructions.find((i) => i.id === selectedId);
  const todayRecord = records.find((r) => isSameDay(new Date(r.recordDate), today));

  const todayValues = todayRecord
    ? {
        motherChecked: todayRecord.motherChecked,
        motherContaminatedM05: todayRecord.motherContaminatedM05,
        motherUsed: todayRecord.motherUsed,
        m05: todayRecord.items.filter((i) => i.lot.stageCode === "M05").reduce((s, i) => s + i.quantityCreated, 0),
        t05: todayRecord.items.filter((i) => i.lot.stageCode === "T05").reduce((s, i) => s + i.quantityCreated, 0),
        t01: todayRecord.items.filter((i) => i.lot.stageCode === "T01").reduce((s, i) => s + i.quantityCreated, 0),
      }
    : null;

  // Tổng MM đã kiểm tra các ngày trước trong tuần (chưa gồm hôm nay) — dùng để chặn vượt số mẫu mẹ
  // được cấp, giống hệt validate phía server.
  const priorMotherChecked = records
    .filter((r) => !isSameDay(new Date(r.recordDate), today))
    .reduce((s, r) => s + r.motherChecked, 0);
  const cumulativeMotherChecked = priorMotherChecked + (Number(form.motherChecked) || 0);

  // Tổng MM đã sử dụng (khác "đã kiểm tra" ở trên — đây là số MM thực sự đem đi cấy) so với tổng MM
  // được chỉ định cấp cho — cùng cách tính cộng dồn + số đang nhập hôm nay.
  const priorMotherUsed = records
    .filter((r) => !isSameDay(new Date(r.recordDate), today))
    .reduce((s, r) => s + r.motherUsed, 0);
  const cumulativeMotherUsed = priorMotherUsed + (Number(form.motherUsed) || 0);
  const motherCheckedExceeded = !!selectedInst && !todayRecord && cumulativeMotherChecked > selectedInst.inputMotherQuantity;

  // "Phát sinh cây cần phân loại" — chỉ hiện khi mã cây chỉ định thuộc 1 nhóm biến thể có >1 thành viên.
  // Tích chọn thì tổng số lượng phân loại theo TỪNG cột (M05/T05/T01) phải khớp CHÍNH XÁC số đã nhập ở
  // cột gốc tương ứng — khớp validate ở POST /api/daily-records.
  const variantMembers = selectedInst?.plantType.variantGroup?.members ?? [];
  const hasVariantGroup = variantMembers.length > 1;
  const variantSum = (stage: "m05" | "t05" | "t01") =>
    variantMembers.reduce((s, m) => s + (Number(variantQty[m.id]?.[stage]) || 0), 0);
  const m05VariantSum = variantSum("m05");
  const t05VariantSum = variantSum("t05");
  const t01VariantSum = variantSum("t01");
  const m05Total = Number(form.m05) || 0;
  const t05Total = Number(form.t05) || 0;
  const t01Total = Number(form.t01) || 0;
  const variantMismatch =
    showVariantSplit && (m05VariantSum !== m05Total || t05VariantSum !== t05Total || t01VariantSum !== t01Total);

  const setVariantField = (plantTypeId: string, stage: "m05" | "t05" | "t01") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setVariantQty((prev) => ({
      ...prev,
      [plantTypeId]: { ...(prev[plantTypeId] ?? { m05: "", t05: "", t01: "" }), [stage]: value },
    }));
  };

  // Nạp lại danh sách chỉ định (tuần hiện tại) — dùng sau khi bấm "Kết thúc chỉ định sớm" (chỉ định vừa
  // chọn không còn ACTIVE nữa).
  const refreshInstructions = async () => {
    const res = await fetch("/api/instructions?status=ACTIVE");
    const data: Instruction[] = await res.json();
    const list = Array.isArray(data) ? data : [];
    const inWeek = list.filter(
      (inst) => inst.weekStart && isSameDay(startOfWeek(new Date(inst.weekStart), { weekStartsOn: 1 }), currentWeekStart)
    );
    setInstructions(inWeek);
    const confirmed = inWeek.filter((i) => i.motherReceivedAt);
    setSelectedId((prev) => (prev && confirmed.some((i) => i.id === prev) ? prev : (confirmed[0]?.id ?? "")));
  };

  const onEndedEarly = async () => {
    setForm(emptyForm);
    setShowVariantSplit(false);
    setVariantQty({});
    await refreshInstructions();
  };

  const answerSundayPrompt = async (willWorkSunday: boolean) => {
    setShowSundayPrompt(false);
    if (willWorkSunday || !selectedId) return;
    setConfirmingSunday(true);
    try {
      const res = await fetch(`/api/instructions/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endEarly: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã kết thúc chỉ định — nhớ bàn giao MM dư nếu còn ở mục \"Bàn giao MM dư\"");
      await onEndedEarly();
    } finally {
      setConfirmingSunday(false);
    }
  };

  const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "motherUsed" || key === "motherContaminatedM05") {
        const used = Number(key === "motherUsed" ? value : f.motherUsed) || 0;
        const contaminatedM05 = Number(key === "motherContaminatedM05" ? value : f.motherContaminatedM05) || 0;
        next.motherChecked = String(used + contaminatedM05);
      }
      return next;
    });
  };

  const onSubmit = async () => {
    if (!selectedId) return;
    // Đã lưu là KHÔNG sửa lại được nữa (chỉ Admin mới sửa được sau này) — bắt buộc dừng lại xác nhận
    // trước khi ghi, đặc biệt nhắc rõ đơn vị vì hay nhầm cụm/túi.
    if (!window.confirm("Hãy kiểm tra lại số liệu trước khi cập nhật — dữ liệu đã lưu sẽ KHÔNG tự sửa lại được.\n\nLưu ý: các ô số lượng đang nhập là SỐ CỤM, không phải số túi.")) {
      return;
    }
    setSubmitting(true);
    try {
      const variantPayload = (stage: "m05" | "t05" | "t01") =>
        variantMembers.map((m) => ({ plantTypeId: m.id, quantity: Number(variantQty[m.id]?.[stage]) || 0 }));
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
          ...(showVariantSplit
            ? { m05Variants: variantPayload("m05"), t05Variants: variantPayload("t05"), t01Variants: variantPayload("t01") }
            : {}),
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
        toast.warning(`Cấy lệch chỉ định — ${deviationParts.join(", ")} — đã gửi cảnh báo cho KY_THUAT`);
      }
      if (json.ended) {
        toast.info(
          json.endReason === "MOTHER_USED_UP"
            ? "Chỉ định đã kết thúc — đã dùng hết số mẫu mẹ được cấp"
            : "Chỉ định đã kết thúc — hết thời gian thực hiện (qua Chủ nhật)"
        );
      } else if (new Date().getDay() === 6) {
        // Thứ 7 (6) mà chỉ định chưa tự kết thúc qua lần lưu này — hỏi luôn có làm thêm Chủ nhật không,
        // vì đây là ngày DUY NHẤT có thể quyết định trước (Chủ nhật thì chỉ định đã tự kết thúc rồi).
        setShowSundayPrompt(true);
      }
      setForm(emptyForm);
      setShowVariantSplit(false);
      setVariantQty({});
      const recRes = await fetch(`/api/daily-records?instructionId=${selectedId}`);
      setRecords(await recRes.json());
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (confirmedInstructions.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-16 text-center text-text-muted">
            <p>
              {hasUnconfirmed
                ? "Bạn có chỉ định tuần này nhưng chưa xác nhận nhận mẫu mẹ — vào \"Nhận bàn giao mẫu mẹ\" để xác nhận trước khi nhập dữ liệu."
                : "Không có chỉ định cấy nào của bạn trong tuần này"}
            </p>
          </CardContent>
        </Card>
        <RepackInstructionPanel />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {confirmedInstructions.length > 1 && (
        <Card>
          <CardContent className="pt-4 space-y-1">
            <label className="text-sm font-medium">Chỉ định cấy</label>
            <Select
              items={confirmedInstructions.map((inst) => ({ value: inst.id, label: `${inst.code} — ${inst.plantType.name}` }))}
              value={selectedId}
              onValueChange={(v) => {
                setSelectedId(v as string);
                setShowVariantSplit(false);
                setVariantQty({});
              }}
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
          </CardContent>
        </Card>
      )}

      {selectedInst && (
        <Card>
          <CardContent className="pt-4 space-y-1">
            <p className="text-xs text-text-secondary font-mono">{selectedInst.code}</p>
            <p className="text-base font-bold text-foreground">{selectedInst.plantType.name}</p>
          </CardContent>
        </Card>
      )}

      {todayRecord && todayValues ? (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary-strong bg-primary-light rounded-lg p-3">
              <Lock className="w-4 h-4 shrink-0" /> Đã nhập dữ liệu cho hôm nay — không thể sửa lại
            </div>
            <div className="divide-y divide-divider">
              {FIELD_ROWS.map((row) => (
                <div key={row.key} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-text-secondary">{row.label}</span>
                  <span className="font-semibold text-foreground">{fmt(todayValues[row.key])}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : selectedInst ? (
        <Card>
          <CardContent className="pt-4 space-y-1">
            {/* Đặt lên đầu bảng — dễ nhận diện hơn để NV cấy mô để ý tích chọn TRƯỚC khi nhập số liệu ở
                bảng bên dưới, thay vì phải cuộn xuống cuối mới thấy (vị trí cũ). */}
            {hasVariantGroup && (
              <div className="border rounded-lg p-3 space-y-3 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={showVariantSplit} onCheckedChange={(c) => setShowVariantSplit(!!c)} />
                  <span className="text-sm font-medium text-foreground">Phát sinh cây cần phân loại</span>
                </label>
                {showVariantSplit && (
                  <div className="space-y-2">
                    {variantMembers.map((m) => (
                      <div key={m.id} className="space-y-1 border-t pt-2 first:border-t-0 first:pt-0">
                        <p className="text-xs font-mono font-medium text-foreground">{m.code}</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-0.5">
                            <span className="text-[11px] text-text-muted">M05 (cụm)</span>
                            <Input type="number" min={0} placeholder="_" className={NUMBER_INPUT_CLASS + " w-full"} value={variantQty[m.id]?.m05 ?? ""} onChange={setVariantField(m.id, "m05")} />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[11px] text-text-muted">T05 (cây)</span>
                            <Input type="number" min={0} placeholder="_" className={NUMBER_INPUT_CLASS + " w-full"} value={variantQty[m.id]?.t05 ?? ""} onChange={setVariantField(m.id, "t05")} />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[11px] text-text-muted">T01 (cây)</span>
                            <Input type="number" min={0} placeholder="_" className={NUMBER_INPUT_CLASS + " w-full"} value={variantQty[m.id]?.t01 ?? ""} onChange={setVariantField(m.id, "t01")} />
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className={`text-xs pt-1 ${variantMismatch ? "text-destructive font-medium" : "text-text-secondary"}`}>
                      Tổng đã phân loại: M05 {m05VariantSum}/{m05Total} · T05 {t05VariantSum}/{t05Total} · T01 {t01VariantSum}/{t01Total}
                      {variantMismatch && " — phải khớp số đã nhập ở trên mới lưu được"}
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="text-sm text-info-foreground bg-info-light rounded-lg p-3 flex items-start gap-2 mb-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p>1. MM đã kiểm tra = MM nhiễm + MM sử dụng</p>
                <p>2. Số điền là cây hoặc cụm, không phải số túi</p>
              </div>
            </div>
            <div className="divide-y divide-divider">
              {FIELD_ROWS.map((row) => (
                <div key={row.key} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-foreground">{row.label}</span>
                  <Input
                    type="number"
                    min={0}
                    disabled={!row.editable}
                    placeholder={row.editable ? "_" : undefined}
                    className={NUMBER_INPUT_CLASS}
                    value={form[row.key]}
                    onChange={row.editable ? setField(row.key) : undefined}
                  />
                </div>
              ))}
            </div>

            <p className="text-xs text-text-secondary pt-2">
              MM đã sử dụng: {fmt(cumulativeMotherUsed)} / {fmt(selectedInst.inputMotherQuantity)} MM được giao
            </p>
            <p className="text-xs text-text-secondary">
              MM đã kiểm tra tuần này: {fmt(cumulativeMotherChecked)} / {fmt(selectedInst.inputMotherQuantity)}
            </p>

            {motherCheckedExceeded && (
              <div className="flex items-center gap-2 text-sm font-medium text-destructive bg-danger-light rounded-lg p-3">
                <TriangleAlert className="w-4 h-4 shrink-0" />
                Tổng MM đã kiểm tra vượt quá số mẫu mẹ được cấp — không thể lưu.
              </div>
            )}

            <Button
              className="w-full bg-primary hover:bg-primary-hover mt-2"
              disabled={submitting || motherCheckedExceeded || variantMismatch}
              onClick={onSubmit}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Lưu dữ liệu hôm nay
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {selectedInst && (
        <EndInstructionEarlyButton instructionId={selectedInst.id} instructionCode={selectedInst.code} onEnded={onEndedEarly} />
      )}

      <RepackInstructionPanel />

      <Dialog open={showSundayPrompt} onOpenChange={setShowSundayPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bạn có làm thêm Chủ nhật không?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            Hôm nay là Thứ 7 — nếu không làm thêm Chủ nhật, chỉ định sẽ được kết thúc sớm ngay bây giờ và bạn cần
            bàn giao mẫu mẹ dư (nếu còn) cho Kho mô ở mục &quot;Bàn giao MM dư&quot;.
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={confirmingSunday}
              onClick={() => answerSundayPrompt(false)}
            >
              {confirmingSunday && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Không
            </Button>
            <Button
              type="button"
              className="flex-1 bg-primary hover:bg-primary-hover"
              disabled={confirmingSunday}
              onClick={() => answerSundayPrompt(true)}
            >
              Có
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
