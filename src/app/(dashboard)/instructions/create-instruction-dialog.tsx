"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Calculator, QrCode } from "lucide-react";
import { toast } from "sonner";
import { MOTHER_SPEC_LABELS, FINISHED_SPEC_LABELS, FINISHED_SPEC_BAG_SIZE } from "@/types";
import { startOfWeek, addWeeks, addDays, format } from "date-fns";
import { vi } from "date-fns/locale";

// Mặc định chỉ định cấy áp dụng cho tuần KẾ TIẾP (không phải tuần hiện tại) — KY_THUAT lên kế hoạch trước.
function nextWeekStart(): string {
  return format(startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

type MediumType = { id: string; code: string; name: string };
type MotherLot = {
  id: string;
  code: string;
  quantity: number;
  stageCode: string;
  plantTypeId: string;
  plantType: { code: string; name: string };
  shelf: { id: string; code: string } | null;
};
type Row = {
  lotId: string;
  lotCode: string;
  stageCode: string;
  available: number;
  quantityUsed: string;
  motherSampleRatio: string;
  rootingRatio: string;
  motherMediumTypeId: string;
  finishedMediumTypeId: string;
};

export default function CreateInstructionDialog({
  initialShelfId,
  triggerContent,
  triggerClassName,
}: {
  // Mở dialog và tự chọn sẵn đúng kệ này — dùng cho lối tắt "Tạo chỉ định" từ banner Nhóm tuần mẫu mẹ
  // đến hạn (xem instructions/page.tsx), KY_THUAT không cần tự tìm lại kệ trong dropdown.
  initialShelfId?: string;
  // Nội dung nút mở dialog tuỳ biến — mặc định là "+ Tạo chỉ định cấy" ở đầu trang.
  triggerContent?: ReactNode;
  triggerClassName?: string;
} = {}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mediumTypes, setMediumTypes] = useState<MediumType[]>([]);
  const [motherLots, setMotherLots] = useState<MotherLot[]>([]);
  const [shelfId, setShelfId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [weekStart, setWeekStart] = useState(nextWeekStart);
  const [notes, setNotes] = useState("");
  // Giá trị KY_THUAT tự gõ tay (chỉ có ý nghĩa sau khi plannedTouched = true) — giá trị HIỂN THỊ thực
  // tế (plannedT01/plannedT05 bên dưới) tính trực tiếp lúc render, không đồng bộ qua effect.
  const [manualT01, setManualT01] = useState("0");
  const [manualT05, setManualT05] = useState("0");
  const [plannedTouched, setPlannedTouched] = useState(false);
  const router = useRouter();

  const shelfGroups = useMemo(() => {
    const map = new Map<string, { shelfId: string; shelfCode: string; plantTypeId: string; plantTypeName: string; lots: MotherLot[] }>();
    for (const lot of motherLots) {
      if (!lot.shelf) continue;
      const existing = map.get(lot.shelf.id);
      if (existing) existing.lots.push(lot);
      else map.set(lot.shelf.id, { shelfId: lot.shelf.id, shelfCode: lot.shelf.code, plantTypeId: lot.plantTypeId, plantTypeName: lot.plantType.name, lots: [lot] });
    }
    return Array.from(map.values());
  }, [motherLots]);
  const selectedShelf = shelfGroups.find((s) => s.shelfId === shelfId);

  useEffect(() => {
    if (!open) return;
    // Lối tắt theo 1 kệ cụ thể (initialShelfId, từ danh sách kệ đến hạn cấy chuyển) lọc thẳng theo
    // shelfId thay vì danh sách chung — danh sách chung giới hạn 200 lô mới nhất (xem /api/lots), lô
    // của 1 kệ đã đến hạn cấy chuyển (nhập kho từ lâu) rất dễ rớt khỏi top 200 đó. Đồng thời KHÔNG lọc
    // availableForInstruction ở đây: mẫu mẹ đến hạn cấy chuyển gần như LUÔN đang là nguồn của chỉ định
    // tuần trước (còn ACTIVE, vì mẫu mẹ dùng lặp lại qua nhiều tuần cấy chuyển, không bị "dùng hết" như
    // mẫu mẹ 1 lần) — nếu vẫn lọc thì kệ đến hạn nào cũng rớt sạch, dialog không bao giờ tự chọn được kệ.
    const lotsUrl = initialShelfId
      ? `/api/lots?stage=MAU_ME&status=ACTIVE&shelfId=${initialShelfId}`
      : "/api/lots?roomType=PHONG_MAU_ME&stage=MAU_ME&status=ACTIVE&availableForInstruction=true";
    Promise.all([
      fetch("/api/medium-types").then((r) => r.json()),
      fetch(lotsUrl).then((r) => r.json()),
    ]).then(([mediums, lots]: [MediumType[], MotherLot[]]) => {
      setMediumTypes(mediums);
      setMotherLots(lots);
      if (initialShelfId) {
        const rowsForShelf = lots.filter((l) => l.shelf?.id === initialShelfId);
        if (rowsForShelf.length > 0) {
          setShelfId(initialShelfId);
          setRows(rowsForShelf.map((lot) => ({
            lotId: lot.id,
            lotCode: lot.code,
            stageCode: lot.stageCode,
            available: lot.quantity,
            quantityUsed: String(lot.quantity),
            motherSampleRatio: "",
            rootingRatio: "",
            motherMediumTypeId: "",
            finishedMediumTypeId: "",
          })));
          setPlannedTouched(false);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Chọn giàn kệ → hiện tất cả các dòng quy cách (M03/M05) đang có trên kệ đó, mặc định lấy toàn bộ số
  // lượng còn lại. Tỉ lệ nhân/ra rễ + môi trường để trống — KY_THUAT tự nhập theo tình trạng thực tế
  // kiểm tra lô đó, không có sẵn gợi ý theo loại cây.
  const onShelfChange = (v: string) => {
    setShelfId(v);
    const group = shelfGroups.find((s) => s.shelfId === v);
    if (!group) { setRows([]); return; }
    const newRows: Row[] = group.lots.map((lot) => ({
      lotId: lot.id,
      lotCode: lot.code,
      stageCode: lot.stageCode,
      available: lot.quantity,
      quantityUsed: String(lot.quantity),
      motherSampleRatio: "",
      rootingRatio: "",
      motherMediumTypeId: "",
      finishedMediumTypeId: "",
    }));
    setRows(newRows);
    setPlannedTouched(false);
  };

  const setRowField = (idx: number, field: keyof Row, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const rowOutputs = rows.map((r) => {
    const qty = Number(r.quantityUsed) || 0;
    const motherRatio = Number(r.motherSampleRatio) || 0;
    const rootingRatio = Number(r.rootingRatio) || 0;
    return {
      ...r,
      qty,
      expectedMother: Math.floor(qty * motherRatio),
      expectedFinished: Math.floor(qty * rootingRatio),
    };
  });
  const totalMotherOutput = rowOutputs.reduce((s, r) => s + r.expectedMother, 0);
  const totalFinishedOutput = rowOutputs.reduce((s, r) => s + r.expectedFinished, 0);

  // Tự đề xuất phân bổ T01/T05 (mặc định dồn hết vào T01) cho tới khi Kỹ thuật tự sửa tay — tính trực
  // tiếp lúc render (không dùng effect để setState, tránh render lồng thừa).
  const plannedT01 = plannedTouched ? manualT01 : String(totalFinishedOutput);
  const plannedT05 = plannedTouched ? manualT05 : "0";
  const plannedSum = (Number(plannedT01) || 0) + (Number(plannedT05) || 0);

  const resetForm = () => {
    setShelfId(""); setRows([]); setWeekStart(nextWeekStart()); setNotes("");
    setManualT01("0"); setManualT05("0"); setPlannedTouched(false);
  };

  const onSubmit = async () => {
    if (!selectedShelf) { toast.error("Chọn giàn kệ nguồn"); return; }
    const usedRows = rowOutputs.filter((r) => r.qty > 0);
    if (usedRows.length === 0) { toast.error("Nhập số lượng dùng cho ít nhất 1 quy cách"); return; }
    for (const r of usedRows) {
      if (r.qty > r.available) { toast.error(`${r.stageCode}: số lượng dùng không được vượt quá ${r.available}`); return; }
      if (!Number(r.motherSampleRatio) || !Number(r.rootingRatio)) { toast.error(`${r.stageCode}: nhập đủ tỉ lệ nhân/ra rễ`); return; }
      if (!r.motherMediumTypeId || !r.finishedMediumTypeId) { toast.error(`${r.stageCode}: chọn đủ 2 môi trường (nhân mẫu mẹ + ra rễ)`); return; }
    }
    if (plannedSum !== totalFinishedOutput) {
      toast.error(`Tổng phân bổ T01 + T05 (${plannedSum.toLocaleString("vi-VN")}) phải bằng đúng thành phẩm dự kiến (${totalFinishedOutput.toLocaleString("vi-VN")})`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantTypeId: selectedShelf.plantTypeId,
          weekStart: weekStart || undefined,
          notes: notes || undefined,
          shelfItems: usedRows.map((r) => ({
            shelfId: selectedShelf.shelfId,
            lotId: r.lotId,
            stageCode: r.stageCode,
            quantity: r.qty,
            motherSampleRatio: Number(r.motherSampleRatio),
            rootingRatio: Number(r.rootingRatio),
            motherMediumTypeId: r.motherMediumTypeId,
            finishedMediumTypeId: r.finishedMediumTypeId,
          })),
          plannedT01Quantity: Number(plannedT01) || 0,
          plannedT05Quantity: Number(plannedT05) || 0,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Tạo chỉ định cấy thành công — chờ Kho mô phân công nhân viên cấy");
      setOpen(false); resetForm(); router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={triggerContent ? "sm" : "default"} className={triggerClassName ?? "bg-primary hover:bg-primary-hover"} />}>
        {triggerContent ?? (
          <>
            <Plus className="w-4 h-4 mr-2" /> Tạo chỉ định cấy
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tạo chỉ định cấy mới</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">

          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <QrCode className="w-3.5 h-3.5 text-text-muted" /> Giàn kệ nguồn <span className="text-destructive">*</span>
            </Label>
            <Select onValueChange={(v) => onShelfChange(v as string)} value={shelfId}>
              <SelectTrigger>
                <SelectValue>
                  {(v: string | null) => {
                    const g = shelfGroups.find((x) => x.shelfId === v);
                    return g ? `Kệ ${g.shelfCode} · ${g.plantTypeName}` : "Chọn kệ (mỗi kệ 1 loại cây)";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {shelfGroups.map((g) => (
                  <SelectItem key={g.shelfId} value={g.shelfId}>
                    Kệ {g.shelfCode} · {g.plantTypeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">Sau này sẽ quét QR code kệ để tự chọn đúng kệ này</p>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              {rowOutputs.map((r, idx) => (
                <div key={r.lotId} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{MOTHER_SPEC_LABELS[r.stageCode as keyof typeof MOTHER_SPEC_LABELS] ?? r.stageCode}</Badge>
                    <span className="text-xs text-text-secondary">Lô {r.lotCode} · còn {r.available.toLocaleString("vi-VN")}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Số lượng dùng</Label>
                      <Input
                        type="number" min={0} max={r.available}
                        value={r.quantityUsed}
                        onChange={(e) => setRowField(idx, "quantityUsed", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tỉ lệ nhân MM</Label>
                      <Input
                        type="number" step="0.1" min="0"
                        value={r.motherSampleRatio}
                        onChange={(e) => setRowField(idx, "motherSampleRatio", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tỉ lệ ra TP</Label>
                      <Input
                        type="number" step="0.1" min="0"
                        value={r.rootingRatio}
                        onChange={(e) => setRowField(idx, "rootingRatio", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Môi trường nhân MM</Label>
                      <Select
                        items={mediumTypes.map((m) => ({ value: m.id, label: m.code }))}
                        value={r.motherMediumTypeId}
                        onValueChange={(v) => setRowField(idx, "motherMediumTypeId", v as string)}
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder="Chọn MT" /></SelectTrigger>
                        <SelectContent>
                          {mediumTypes.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Môi trường ra rễ (TP)</Label>
                      <Select
                        items={mediumTypes.map((m) => ({ value: m.id, label: m.code }))}
                        value={r.finishedMediumTypeId}
                        onValueChange={(v) => setRowField(idx, "finishedMediumTypeId", v as string)}
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
                  {r.qty > 0 && (
                    <p className="text-xs text-text-secondary">
                      → Mẫu mẹ dự kiến: <strong>{r.expectedMother.toLocaleString("vi-VN")}</strong> · Thành phẩm dự kiến: <strong>{r.expectedFinished.toLocaleString("vi-VN")}</strong>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <Label>Tuần thực hiện</Label>
            <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            {weekStart && (
              <p className="text-xs text-text-secondary">
                Thứ 2, {format(new Date(weekStart), "dd/MM/yyyy", { locale: vi })} – Chủ nhật,{" "}
                {format(addDays(new Date(weekStart), 6), "dd/MM/yyyy", { locale: vi })}
              </p>
            )}
          </div>

          {(totalMotherOutput > 0 || totalFinishedOutput > 0) && (
            <div className="bg-info-light rounded-lg p-3 space-y-3">
              <p className="text-xs font-medium text-info-foreground flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5" /> Tổng dự kiến (cộng dồn các quy cách nguồn)
              </p>
              <div className="bg-white rounded p-2 text-sm">
                <p>→ Mẫu mẹ dự kiến: <strong>{totalMotherOutput.toLocaleString("vi-VN")}</strong></p>
                <p>→ Thành phẩm dự kiến: <strong>{totalFinishedOutput.toLocaleString("vi-VN")}</strong></p>
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
                        // Chốt luôn giá trị T01 đang hiển thị (auto hoặc đã sửa tay từ trước) vào state
                        // gõ tay TẠI THỜI ĐIỂM NÀY — vì sau khi touched=true, plannedT01 sẽ đọc thẳng từ
                        // manualT01 thay vì tự tính lại theo totalFinishedOutput.
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
                  Đã phân bổ: {plannedSum.toLocaleString("vi-VN")} / {totalFinishedOutput.toLocaleString("vi-VN")}
                  {plannedSum !== totalFinishedOutput && " — phải khớp đúng mới tạo được chỉ định"}
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
              Tạo chỉ định
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
