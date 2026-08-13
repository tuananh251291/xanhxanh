"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Loader2, Calculator } from "lucide-react";
import { toast } from "sonner";
import { MOTHER_SPEC_LABELS, FINISHED_SPEC_LABELS, FINISHED_SPEC_BAG_SIZE } from "@/types";
import { startOfWeek, format, getISOWeek } from "date-fns";

function currentWeekStart(): Date {
  return startOfWeek(new Date(), { weekStartsOn: 1 });
}

// Cùng cách chấp nhận cả dấu phẩy/dấu chấm như create-instruction-dialog.tsx.
function parseRatio(value: string): number {
  return Number(value.replace(",", ".")) || 0;
}

type MediumType = { id: string; code: string; name: string };
type InstructionDetail = {
  weekStart: string | null;
  notes: string | null;
  plannedT01Quantity: number | null;
  plannedT05Quantity: number | null;
  plantType: { code: string; name: string };
  items: {
    id: string;
    stageCode: string | null;
    quantity: number;
    motherSampleRatio: number | null;
    rootingRatio: number | null;
    motherMediumTypeId: string | null;
    finishedMediumTypeId: string | null;
    preRootingMotherRatio: number | null;
    preRootingMotherMediumTypeId: string | null;
    shelf: { code: string };
    lot: { quantity: number } | null;
  }[];
};
type Row = { itemId: string; shelfCode: string; stageCode: string; available: number | null; quantityUsed: string };

// Sửa chỉ định cấy TRƯỚC khi Kho mô bàn giao — chỉ đổi số lượng/tỉ lệ/môi trường/tuần thực hiện/ghi
// chú của các dòng ĐÃ CÓ, không cho thêm/bớt giàn kệ nguồn (xem comment ở PATCH /api/instructions/[id]
// nhánh "edit" — đổi giàn kệ đòi hỏi revert/re-plant trạng thái lô nguồn, ngoài phạm vi tính năng này).
export default function EditInstructionDialog({ instructionId }: { instructionId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mediumTypes, setMediumTypes] = useState<MediumType[]>([]);
  const [plantTypeLabel, setPlantTypeLabel] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [sharedMotherSampleRatio, setSharedMotherSampleRatio] = useState("");
  const [sharedRootingRatio, setSharedRootingRatio] = useState("");
  const [sharedMotherMediumTypeId, setSharedMotherMediumTypeId] = useState("");
  const [sharedFinishedMediumTypeId, setSharedFinishedMediumTypeId] = useState("");
  const [sharedPreRootingMotherRatio, setSharedPreRootingMotherRatio] = useState("");
  const [sharedPreRootingMotherMediumTypeId, setSharedPreRootingMotherMediumTypeId] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [notes, setNotes] = useState("");
  const [manualT01, setManualT01] = useState("0");
  const [manualT05, setManualT05] = useState("0");
  const [plannedTouched, setPlannedTouched] = useState(false);
  const router = useRouter();

  // Không dùng cờ "đang tải" riêng — chỉ hiện dữ liệu ngay khi có (giống create-instruction-dialog.tsx),
  // rows/label rỗng trong lúc chờ fetch xong (rất nhanh, không cần spinner chặn cả dialog).
  const load = useCallback(async () => {
    const [mediums, inst]: [MediumType[], InstructionDetail] = await Promise.all([
      fetch("/api/medium-types").then((r) => r.json()),
      fetch(`/api/instructions/${instructionId}`).then((r) => r.json()),
    ]);
    setMediumTypes(mediums);
    setPlantTypeLabel(`${inst.plantType.code} · ${inst.plantType.name}`);
    setRows(
      inst.items.map((it) => ({
        itemId: it.id,
        shelfCode: it.shelf.code,
        stageCode: it.stageCode ?? "",
        available: it.lot?.quantity ?? null,
        quantityUsed: String(it.quantity),
      }))
    );
    const first = inst.items[0];
    setSharedMotherSampleRatio(first?.motherSampleRatio != null ? String(first.motherSampleRatio) : "");
    setSharedRootingRatio(first?.rootingRatio != null ? String(first.rootingRatio) : "");
    setSharedMotherMediumTypeId(first?.motherMediumTypeId ?? "");
    setSharedFinishedMediumTypeId(first?.finishedMediumTypeId ?? "");
    setSharedPreRootingMotherRatio(first?.preRootingMotherRatio != null ? String(first.preRootingMotherRatio) : "");
    setSharedPreRootingMotherMediumTypeId(first?.preRootingMotherMediumTypeId ?? "");
    setWeekStart(inst.weekStart ? format(new Date(inst.weekStart), "yyyy-MM-dd") : "");
    setNotes(inst.notes ?? "");
    setManualT01(String(inst.plannedT01Quantity ?? 0));
    setManualT05(String(inst.plannedT05Quantity ?? 0));
    setPlannedTouched(false);
  }, [instructionId]);

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const motherRatioEntered = sharedMotherSampleRatio.trim() !== "";
  const rootingRatioEntered = sharedRootingRatio.trim() !== "";
  const preRootingRatioEntered = sharedPreRootingMotherRatio.trim() !== "";
  const sharedMotherRatioNum = parseRatio(sharedMotherSampleRatio);
  const sharedRootingRatioNum = parseRatio(sharedRootingRatio);
  const sharedPreRootingMotherRatioNum = parseRatio(sharedPreRootingMotherRatio);

  const rowOutputs = rows.map((r) => {
    const qty = Number(r.quantityUsed) || 0;
    return {
      ...r,
      qty,
      expectedMother: Math.floor(qty * sharedMotherRatioNum),
      expectedFinished: Math.floor(qty * sharedRootingRatioNum),
      expectedPreRootingMother: Math.floor(qty * sharedPreRootingMotherRatioNum),
    };
  });
  const totalFinishedOutput = rowOutputs.reduce((s, r) => s + r.expectedFinished, 0);
  const totalMotherOutput = rowOutputs.reduce((s, r) => s + r.expectedMother, 0);
  const totalPreRootingMotherOutput = rowOutputs.reduce((s, r) => s + r.expectedPreRootingMother, 0);

  const plannedT01 = plannedTouched ? manualT01 : String(totalFinishedOutput);
  const plannedT05 = plannedTouched ? manualT05 : "0";
  const plannedSum = (Number(plannedT01) || 0) + (Number(plannedT05) || 0);

  const setRowQuantity = (idx: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantityUsed: value } : r)));
  };

  const onSubmit = async () => {
    if (!weekStart) { toast.error("Chọn Tuần thực hiện"); return; }
    if (startOfWeek(new Date(weekStart), { weekStartsOn: 1 }) < currentWeekStart()) {
      toast.error("Không được chọn tuần đã trôi qua");
      return;
    }
    for (const r of rowOutputs) {
      if (r.qty <= 0) { toast.error(`Kệ ${r.shelfCode}: số lượng dùng phải lớn hơn 0`); return; }
      if (r.available != null && r.qty > r.available) {
        toast.error(`Kệ ${r.shelfCode}: số lượng dùng không được vượt quá ${r.available.toLocaleString("vi-VN")} cụm`);
        return;
      }
    }
    if (motherRatioEntered && sharedMotherRatioNum <= 0) { toast.error("Tỉ lệ nhân MM phải lớn hơn 0"); return; }
    if (rootingRatioEntered && sharedRootingRatioNum < 0) { toast.error("Tỉ lệ ra rễ không được âm"); return; }
    if (!motherRatioEntered && !window.confirm("Bạn đang để trống Tỉ lệ nhân MM — chỉ định sẽ không có mẫu mẹ dự kiến. Bạn có muốn tiếp tục không?")) return;
    if (!rootingRatioEntered && !window.confirm("Bạn đang để trống Tỉ lệ ra rễ (TP) — chỉ định sẽ không có thành phẩm dự kiến. Bạn có muốn tiếp tục không?")) return;
    if (motherRatioEntered && !sharedMotherMediumTypeId) { toast.error("Chọn môi trường nhân MM"); return; }
    if (rootingRatioEntered && !sharedFinishedMediumTypeId) { toast.error("Chọn môi trường ra rễ (TP)"); return; }
    if (preRootingRatioEntered && sharedPreRootingMotherRatioNum <= 0) { toast.error("Tỉ lệ nhân MM tiền ra rễ phải lớn hơn 0"); return; }
    if (preRootingRatioEntered && !sharedPreRootingMotherMediumTypeId) { toast.error("Chọn môi trường cho Mẫu mẹ tiền ra rễ"); return; }
    if (plannedSum !== totalFinishedOutput) {
      toast.error(`Tổng phân bổ T01 + T05 (${plannedSum.toLocaleString("vi-VN")} cây) phải bằng đúng thành phẩm dự kiến (${totalFinishedOutput.toLocaleString("vi-VN")} cây)`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edit: {
            weekStart,
            notes: notes || undefined,
            items: rowOutputs.map((r) => ({
              itemId: r.itemId,
              quantity: r.qty,
              motherSampleRatio: motherRatioEntered ? sharedMotherRatioNum : null,
              rootingRatio: rootingRatioEntered ? sharedRootingRatioNum : null,
              motherMediumTypeId: motherRatioEntered ? sharedMotherMediumTypeId : null,
              finishedMediumTypeId: rootingRatioEntered ? sharedFinishedMediumTypeId : null,
              preRootingMotherRatio: preRootingRatioEntered ? sharedPreRootingMotherRatioNum : null,
              preRootingMotherMediumTypeId: preRootingRatioEntered ? sharedPreRootingMotherMediumTypeId : null,
            })),
            plannedT01Quantity: Number(plannedT01) || 0,
            plannedT05Quantity: Number(plannedT05) || 0,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      if (json.mediumOrderLocked) {
        toast.warning(
          "Đã lưu chỉnh sửa — nhưng đơn môi trường liên quan đã được NV môi trường xác nhận nên KHÔNG tự cập nhật số lượng, cần báo NV môi trường điều chỉnh thủ công nếu cần."
        );
      } else {
        toast.success("Đã lưu chỉnh sửa chỉ định cấy");
      }
      setOpen(false);
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-8" />}>
        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Sửa
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[64rem] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Sửa chỉ định cấy</DialogTitle></DialogHeader>

        <div className="space-y-4 mt-2">
            <p className="text-sm text-text-secondary">
              Mã cây: <strong className="text-foreground">{plantTypeLabel}</strong>
            </p>
            <p className="text-xs text-text-muted">
              Chỉ sửa được số lượng dùng/tỉ lệ/môi trường/tuần thực hiện — không đổi được giàn kệ nguồn.
            </p>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-2 py-1.5 text-sm text-primary-strong font-bold">Kệ</th>
                    <th className="text-left px-2 py-1.5 text-sm text-primary-strong font-bold">Quy cách</th>
                    <th className="text-right px-2 py-1.5 text-sm text-primary-strong font-bold">Còn lại (cụm)</th>
                    <th className="text-left px-2 py-1.5 text-sm text-primary-strong font-bold">Số lượng dùng (cụm)</th>
                  </tr>
                </thead>
                <tbody>
                  {rowOutputs.map((r, idx) => (
                    <tr key={r.itemId} className="border-t">
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.shelfCode}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-text-secondary">
                        {MOTHER_SPEC_LABELS[r.stageCode as keyof typeof MOTHER_SPEC_LABELS] ?? r.stageCode}
                      </td>
                      <td className="px-2 py-1.5 text-right">{r.available != null ? r.available.toLocaleString("vi-VN") : "—"}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" min={0} max={r.available ?? undefined}
                          className="h-8 w-28"
                          value={r.quantityUsed}
                          onChange={(e) => setRowQuantity(idx, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-text-secondary">Mẫu mẹ — dùng chung cho tất cả các kệ trên</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tỉ lệ nhân MM</Label>
                  <Input
                    type="text" inputMode="decimal" placeholder="VD: 1,5 hoặc 1.5"
                    value={sharedMotherSampleRatio}
                    onChange={(e) => setSharedMotherSampleRatio(e.target.value)}
                  />
                  <p className="text-[11px] text-text-muted">Số cụm MM ra / số cụm MM dùng — gõ dấu phẩy hoặc dấu chấm đều được, có thể để trống nếu chưa xác định</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Môi trường nhân MM{!motherRatioEntered && " (không bắt buộc — chưa nhập tỉ lệ)"}</Label>
                  <Select
                    items={mediumTypes.map((m) => ({ value: m.id, label: m.code }))}
                    value={sharedMotherMediumTypeId}
                    onValueChange={(v) => setSharedMotherMediumTypeId(v as string)}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Chọn MT" /></SelectTrigger>
                    <SelectContent>
                      {mediumTypes.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-text-secondary">
                Mẫu mẹ tiền ra rễ (không bắt buộc) — quy cách M05 thứ 2, tỉ lệ + môi trường riêng, tính trên cùng số lượng dùng ở trên
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tỉ lệ nhân MM tiền ra rễ</Label>
                  <Input
                    type="text" inputMode="decimal" placeholder="VD: 1,5 hoặc 1.5"
                    value={sharedPreRootingMotherRatio}
                    onChange={(e) => setSharedPreRootingMotherRatio(e.target.value)}
                  />
                  <p className="text-[11px] text-text-muted">Để trống nếu chỉ định này chỉ có 1 loại M05 (Mẫu mẹ)</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Môi trường nhân MM tiền ra rễ{!preRootingRatioEntered && " (không bắt buộc — chưa nhập tỉ lệ)"}</Label>
                  <Select
                    items={mediumTypes.map((m) => ({ value: m.id, label: m.code }))}
                    value={sharedPreRootingMotherMediumTypeId}
                    onValueChange={(v) => setSharedPreRootingMotherMediumTypeId(v as string)}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Chọn MT" /></SelectTrigger>
                    <SelectContent>
                      {mediumTypes.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-text-secondary">Thành phẩm (T01/T05) — dùng chung cho tất cả các kệ trên</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tỉ lệ ra TP</Label>
                  <Input
                    type="text" inputMode="decimal" placeholder="VD: 1,5 hoặc 1.5"
                    value={sharedRootingRatio}
                    onChange={(e) => setSharedRootingRatio(e.target.value)}
                  />
                  <p className="text-[11px] text-text-muted">Số cây TP ra / số cụm MM dùng — gõ dấu phẩy hoặc dấu chấm đều được, có thể để trống nếu chưa xác định</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Môi trường ra TP{!rootingRatioEntered && " (không bắt buộc — chưa nhập tỉ lệ)"}</Label>
                  <Select
                    items={mediumTypes.map((m) => ({ value: m.id, label: m.code }))}
                    value={sharedFinishedMediumTypeId}
                    onValueChange={(v) => setSharedFinishedMediumTypeId(v as string)}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Chọn MT" /></SelectTrigger>
                    <SelectContent>
                      {mediumTypes.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Tuần thực hiện</Label>
              <Input
                type="date"
                required
                min={format(currentWeekStart(), "yyyy-MM-dd")}
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
              {weekStart && (
                <p className="text-xs text-text-secondary">Tuần số {getISOWeek(new Date(weekStart))}</p>
              )}
            </div>

            {(totalMotherOutput > 0 || totalFinishedOutput > 0) && (
              <div className="bg-info-light rounded-lg p-3 space-y-3">
                <p className="text-xs font-medium text-info-foreground flex items-center gap-1">
                  <Calculator className="w-3.5 h-3.5" /> Tổng dự kiến (cộng dồn các quy cách nguồn)
                </p>
                <div className="bg-white rounded p-2 text-sm">
                  <p>
                    → Mẫu mẹ dự kiến:{" "}
                    <strong>{motherRatioEntered ? `${totalMotherOutput.toLocaleString("vi-VN")} cụm` : "— (chưa nhập tỉ lệ)"}</strong>
                  </p>
                  {preRootingRatioEntered && (
                    <p>
                      → Mẫu mẹ tiền ra rễ dự kiến: <strong>{totalPreRootingMotherOutput.toLocaleString("vi-VN")} cụm</strong>
                    </p>
                  )}
                  <p>
                    → Thành phẩm dự kiến:{" "}
                    <strong>{rootingRatioEntered ? `${totalFinishedOutput.toLocaleString("vi-VN")} cây` : "— (chưa nhập tỉ lệ)"}</strong>
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phân bổ quy cách thành phẩm dự kiến</Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-text-secondary">{FINISHED_SPEC_LABELS.T01}</Label>
                      <Input
                        type="number" min={0}
                        value={plannedT01}
                        onChange={(e) => {
                          setPlannedTouched(true);
                          setManualT01(e.target.value);
                          setManualT05(String(Math.max(0, totalFinishedOutput - (Number(e.target.value) || 0))));
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-text-secondary">{FINISHED_SPEC_LABELS.T05}</Label>
                      <Input
                        type="number" min={0}
                        value={plannedT05}
                        onChange={(e) => {
                          setPlannedTouched(true);
                          setManualT01(plannedT01);
                          setManualT05(e.target.value);
                        }}
                      />
                      <p className="text-xs text-text-muted">
                        ≈ {Math.floor((Number(plannedT05) || 0) / FINISHED_SPEC_BAG_SIZE.T05).toLocaleString("vi-VN")} túi
                        {(Number(plannedT05) || 0) % FINISHED_SPEC_BAG_SIZE.T05 > 0 && ` (dư ${(Number(plannedT05) || 0) % FINISHED_SPEC_BAG_SIZE.T05} cây)`}
                      </p>
                    </div>
                  </div>
                  <p className={plannedSum === totalFinishedOutput ? "text-xs text-primary-strong" : "text-xs text-warning-foreground"}>
                    Đã phân bổ: {plannedSum.toLocaleString("vi-VN")} / {totalFinishedOutput.toLocaleString("vi-VN")} cây
                    {plannedSum !== totalFinishedOutput && " — phải khớp đúng mới lưu được"}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Ghi chú</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú thêm..." />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
              <Button
                type="button" className="flex-1 bg-primary hover:bg-primary-hover"
                disabled={loading || plannedSum !== totalFinishedOutput}
                onClick={onSubmit}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Lưu chỉnh sửa
              </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
