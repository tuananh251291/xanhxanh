"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Lock, TriangleAlert, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { isSameDay, startOfWeek } from "date-fns";

type InstructionItem = { stageCode: string | null; expectedMotherOutput: number | null };
type Instruction = {
  id: string;
  code: string;
  plantType: { name: string };
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
  const motherCheckedExceeded = !!selectedInst && !todayRecord && cumulativeMotherChecked > selectedInst.inputMotherQuantity;

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
        toast.warning(`Cấy lệch chỉ định — ${deviationParts.join(", ")} — đã gửi cảnh báo cho KY_THUAT`);
      }
      if (json.ended) {
        toast.info(
          json.endReason === "MOTHER_USED_UP"
            ? "Chỉ định đã kết thúc — đã dùng hết số mẫu mẹ được cấp"
            : "Chỉ định đã kết thúc — hết thời gian thực hiện (qua Chủ nhật)"
        );
      }
      setForm(emptyForm);
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
      <Card>
        <CardContent className="py-16 text-center text-text-muted">
          <p>
            {hasUnconfirmed
              ? "Bạn có chỉ định tuần này nhưng chưa xác nhận nhận mẫu mẹ — vào \"Nhận bàn giao mẫu mẹ\" để xác nhận trước khi nhập dữ liệu."
              : "Không có chỉ định cấy nào của bạn trong tuần này"}
          </p>
        </CardContent>
      </Card>
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
              disabled={submitting || motherCheckedExceeded}
              onClick={onSubmit}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Lưu dữ liệu hôm nay
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
