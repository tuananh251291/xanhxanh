"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Calculator, QrCode } from "lucide-react";
import { toast } from "sonner";
import { MOTHER_SPEC_LABELS, FINISHED_SPEC_LABELS } from "@/types";

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
type PlantTypeSpec = {
  plantTypeId: string;
  stageCode: string;
  motherSampleRatio: number;
  rootingRatio: number;
  motherMediumTypeId: string | null;
  finishedMediumTypeId: string | null;
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

export default function CreateInstructionDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mediumTypes, setMediumTypes] = useState<MediumType[]>([]);
  const [motherLots, setMotherLots] = useState<MotherLot[]>([]);
  const [specs, setSpecs] = useState<PlantTypeSpec[]>([]);
  const [shelfId, setShelfId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [weekStart, setWeekStart] = useState("");
  const [notes, setNotes] = useState("");
  const [plannedT01, setPlannedT01] = useState("0");
  const [plannedT05, setPlannedT05] = useState("0");
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
    Promise.all([
      fetch("/api/medium-types").then((r) => r.json()),
      fetch("/api/lots?roomType=PHONG_SANG&stage=MAU_ME&status=ACTIVE").then((r) => r.json()),
      fetch("/api/plant-type-specs").then((r) => r.json()),
    ]).then(([mediums, lots, specList]) => {
      setMediumTypes(mediums);
      setMotherLots(lots);
      setSpecs(specList);
    });
  }, [open]);

  // Chọn giàn kệ → hiện tất cả các dòng quy cách (M3/M5) đang có trên kệ đó, mỗi dòng tự điền
  // tỉ lệ/môi trường theo cấu hình quy cách của loại cây, mặc định lấy toàn bộ số lượng còn lại.
  const onShelfChange = (v: string) => {
    setShelfId(v);
    const group = shelfGroups.find((s) => s.shelfId === v);
    if (!group) { setRows([]); return; }
    const newRows: Row[] = group.lots.map((lot) => {
      const spec = specs.find((s) => s.plantTypeId === lot.plantTypeId && s.stageCode === lot.stageCode);
      return {
        lotId: lot.id,
        lotCode: lot.code,
        stageCode: lot.stageCode,
        available: lot.quantity,
        quantityUsed: String(lot.quantity),
        motherSampleRatio: spec ? String(spec.motherSampleRatio) : "",
        rootingRatio: spec ? String(spec.rootingRatio) : "",
        motherMediumTypeId: spec?.motherMediumTypeId ?? "",
        finishedMediumTypeId: spec?.finishedMediumTypeId ?? "",
      };
    });
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

  // Tự đề xuất phân bổ T01/T05 (mặc định dồn hết vào T01) cho tới khi Kỹ thuật tự sửa tay.
  useEffect(() => {
    if (plannedTouched) return;
    setPlannedT01(String(totalFinishedOutput));
    setPlannedT05("0");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalFinishedOutput, plannedTouched]);

  const plannedSum = (Number(plannedT01) || 0) + (Number(plannedT05) || 0);

  const resetForm = () => {
    setShelfId(""); setRows([]); setWeekStart(""); setNotes("");
    setPlannedT01("0"); setPlannedT05("0"); setPlannedTouched(false);
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
      <DialogTrigger render={<Button className="bg-green-600 hover:bg-green-700" />}>
        <Plus className="w-4 h-4 mr-2" /> Tạo chỉ định cấy
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tạo chỉ định cấy mới</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">

          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <QrCode className="w-3.5 h-3.5 text-gray-400" /> Giàn kệ nguồn <span className="text-red-500">*</span>
            </Label>
            <Select onValueChange={onShelfChange} value={shelfId || undefined}>
              <SelectTrigger><SelectValue placeholder="Chọn kệ (mỗi kệ 1 loại cây)" /></SelectTrigger>
              <SelectContent>
                {shelfGroups.map((g) => (
                  <SelectItem key={g.shelfId} value={g.shelfId}>
                    Kệ {g.shelfCode} · {g.plantTypeName} · {g.lots.map((l) => `${l.stageCode}: còn ${l.quantity.toLocaleString("vi-VN")}`).join(", ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">Sau này sẽ quét QR code kệ để tự chọn đúng kệ này</p>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              {rowOutputs.map((r, idx) => (
                <div key={r.lotId} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{MOTHER_SPEC_LABELS[r.stageCode as keyof typeof MOTHER_SPEC_LABELS] ?? r.stageCode}</Badge>
                    <span className="text-xs text-gray-500">Lô {r.lotCode} · còn {r.available.toLocaleString("vi-VN")}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Môi trường nhân MM</Label>
                      <Select value={r.motherMediumTypeId || undefined} onValueChange={(v) => setRowField(idx, "motherMediumTypeId", v as string)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Chọn MT" /></SelectTrigger>
                        <SelectContent>
                          {mediumTypes.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Môi trường ra rễ (TP)</Label>
                      <Select value={r.finishedMediumTypeId || undefined} onValueChange={(v) => setRowField(idx, "finishedMediumTypeId", v as string)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Chọn MT" /></SelectTrigger>
                        <SelectContent>
                          {mediumTypes.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {r.qty > 0 && (
                    <p className="text-xs text-gray-500">
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
          </div>

          {(totalMotherOutput > 0 || totalFinishedOutput > 0) && (
            <div className="bg-blue-50 rounded-lg p-3 space-y-3">
              <p className="text-xs font-medium text-blue-700 flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5" /> Tổng dự kiến (cộng dồn các quy cách nguồn)
              </p>
              <div className="bg-white rounded p-2 text-sm">
                <p>→ Mẫu mẹ dự kiến: <strong>{totalMotherOutput.toLocaleString("vi-VN")}</strong></p>
                <p>→ Thành phẩm dự kiến: <strong>{totalFinishedOutput.toLocaleString("vi-VN")}</strong></p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phân bổ quy cách thành phẩm dự kiến</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">{FINISHED_SPEC_LABELS.T01}</Label>
                    <Input
                      type="number" min={0}
                      value={plannedT01}
                      onChange={(e) => { setPlannedTouched(true); setPlannedT01(e.target.value); }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">{FINISHED_SPEC_LABELS.T05}</Label>
                    <Input
                      type="number" min={0}
                      value={plannedT05}
                      onChange={(e) => { setPlannedTouched(true); setPlannedT05(e.target.value); }}
                    />
                  </div>
                </div>
                <p className={plannedSum === totalFinishedOutput ? "text-xs text-green-600" : "text-xs text-orange-500"}>
                  Đã phân bổ: {plannedSum.toLocaleString("vi-VN")} / {totalFinishedOutput.toLocaleString("vi-VN")}
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
            <Button type="button" className="flex-1 bg-green-600 hover:bg-green-700" disabled={loading} onClick={onSubmit}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Tạo chỉ định
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
