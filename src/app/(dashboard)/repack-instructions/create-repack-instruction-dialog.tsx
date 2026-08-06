"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FINISHED_SPEC_LABELS, FINISHED_SPEC_BAG_SIZE } from "@/types";

type FinishedLot = {
  id: string;
  code: string;
  quantity: number;
  stageCode: string;
  plantType: { code: string; name: string };
  shelf: { id: string; code: string; warehouse: { name: string } } | null;
};

const OUTPUT_STAGE_CODES = Object.keys(FINISHED_SPEC_LABELS) as (keyof typeof FINISHED_SPEC_LABELS)[];
const stageLabel = (code: string) => FINISHED_SPEC_LABELS[code as keyof typeof FINISHED_SPEC_LABELS] ?? code;
const bagSizeOf = (code: string) => FINISHED_SPEC_BAG_SIZE[code as keyof typeof FINISHED_SPEC_BAG_SIZE] ?? 1;

export default function CreateRepackInstructionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lots, setLots] = useState<FinishedLot[]>([]);
  const [shelfId, setShelfId] = useState("");
  const [plantTypeCode, setPlantTypeCode] = useState("");
  const [inputStageCode, setInputStageCode] = useState("");
  const [bagsInput, setBagsInput] = useState("");
  const [outputStageCode, setOutputStageCode] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/lots?roomType=PHONG_RA_RE&stage=THANH_PHAM&status=ACTIVE")
      .then((r) => r.json())
      .then((data: FinishedLot[]) => setLots(Array.isArray(data) ? data.filter((l) => l.shelf) : []))
      .finally(() => setLoading(false));
  }, [open]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setLoading(true);
      setShelfId(""); setPlantTypeCode(""); setInputStageCode(""); setBagsInput(""); setOutputStageCode("");
    }
  };

  const shelves = useMemo(() => {
    const map = new Map<string, { id: string; code: string; warehouseName: string }>();
    for (const l of lots) {
      if (l.shelf && !map.has(l.shelf.id)) {
        map.set(l.shelf.id, { id: l.shelf.id, code: l.shelf.code, warehouseName: l.shelf.warehouse.name });
      }
    }
    return Array.from(map.values());
  }, [lots]);

  const lotsOnShelf = useMemo(() => lots.filter((l) => l.shelf?.id === shelfId), [lots, shelfId]);

  // Chọn theo Loại cây + Quy cách thay vì chọn thẳng 1 lô (mã lô khó nhớ với KY_THUAT) — trên 1 kệ, 1
  // cặp (mã cây, quy cách) chỉ ứng với ĐÚNG 1 lô đang ACTIVE (xem placeRepackOutput merge-theo-cặp-này ở
  // src/lib/repack-placement.ts), nên chọn xong 2 bước này là xác định lô nguồn chắc chắn, không mơ hồ.
  const plantTypesOnShelf = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const l of lotsOnShelf) if (!map.has(l.plantType.code)) map.set(l.plantType.code, l.plantType);
    return Array.from(map.values());
  }, [lotsOnShelf]);

  const stageCodesForPlantType = useMemo(
    () => lotsOnShelf.filter((l) => l.plantType.code === plantTypeCode).map((l) => l.stageCode),
    [lotsOnShelf, plantTypeCode]
  );

  const selectedLot = lotsOnShelf.find((l) => l.plantType.code === plantTypeCode && l.stageCode === inputStageCode);
  const inputBagSize = inputStageCode ? bagSizeOf(inputStageCode) : null;
  const availableBags = selectedLot && inputBagSize ? Math.floor(selectedLot.quantity / inputBagSize) : 0;
  const leftoverPlants = selectedLot && inputBagSize ? selectedLot.quantity % inputBagSize : 0;
  const bags = Number(bagsInput) || 0;
  const qty = inputBagSize ? bags * inputBagSize : 0;
  const outputBagSize = outputStageCode ? bagSizeOf(outputStageCode) : null;

  const onSubmit = async () => {
    if (!selectedLot) { toast.error("Chọn loại cây và quy cách nguồn trước"); return; }
    if (bags <= 0 || bags > availableBags) { toast.error("Số túi không hợp lệ"); return; }
    if (!outputStageCode) { toast.error("Chọn quy cách đầu ra"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/repack-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceShelfId: shelfId, sourceLotId: selectedLot.id, inputQuantity: qty, outputStageCode }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã tạo chỉ định cấy xử lý ${json.code}`);
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button className="bg-primary hover:bg-primary-hover" />}>
        <Plus className="w-4 h-4 mr-1.5" /> Tạo chỉ định cấy xử lý
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo chỉ định cấy xử lý</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Kệ nguồn (Phòng ra rễ)</Label>
              <Select
                items={shelves.map((s) => ({ value: s.id, label: `${s.code} — ${s.warehouseName}` }))}
                value={shelfId || null}
                onValueChange={(v) => {
                  setShelfId(v as string);
                  setPlantTypeCode(""); setInputStageCode(""); setBagsInput("");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Chọn kệ nguồn" /></SelectTrigger>
                <SelectContent>
                  {shelves.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.code} — {s.warehouseName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {shelfId && (
              <div className="space-y-1">
                <Label>Loại cây</Label>
                <Select
                  items={plantTypesOnShelf.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))}
                  value={plantTypeCode || null}
                  onValueChange={(v) => {
                    setPlantTypeCode(v as string);
                    setInputStageCode(""); setBagsInput("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Chọn loại cây" /></SelectTrigger>
                  <SelectContent>
                    {plantTypesOnShelf.map((p) => (
                      <SelectItem key={p.code} value={p.code}>{p.code} — {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {plantTypesOnShelf.length === 0 && <p className="text-xs text-text-muted">Kệ này không còn lô nào</p>}
              </div>
            )}

            {plantTypeCode && (
              <div className="space-y-1">
                <Label>Quy cách nguồn</Label>
                <Select
                  items={stageCodesForPlantType.map((c) => ({ value: c, label: stageLabel(c) }))}
                  value={inputStageCode || null}
                  onValueChange={(v) => {
                    setInputStageCode(v as string);
                    setBagsInput("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Chọn quy cách nguồn" /></SelectTrigger>
                  <SelectContent>
                    {stageCodesForPlantType.map((c) => (
                      <SelectItem key={c} value={c}>{stageLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedLot && inputBagSize && (
              <>
                <div className="bg-info-light rounded-lg p-3 text-sm text-info-foreground">
                  Đang có <b>{availableBags.toLocaleString("vi-VN")} túi</b> {stageLabel(inputStageCode)} trên kệ này
                  {" "}({selectedLot.quantity.toLocaleString("vi-VN")} cây, {inputBagSize} cây/túi
                  {leftoverPlants > 0 ? `, dư ${leftoverPlants} cây lẻ chưa đủ 1 túi — không tính được` : ""})
                </div>

                <div className="space-y-1">
                  <Label>Số túi lấy ra (tối đa {availableBags.toLocaleString("vi-VN")})</Label>
                  <Input
                    type="number" min={1} max={availableBags} step={1}
                    value={bagsInput} onChange={(e) => setBagsInput(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Quy cách đầu ra</Label>
                  <Select
                    items={OUTPUT_STAGE_CODES.filter((c) => c !== inputStageCode).map((c) => ({ value: c, label: FINISHED_SPEC_LABELS[c] }))}
                    value={outputStageCode || null}
                    onValueChange={(v) => setOutputStageCode(v as string)}
                  >
                    <SelectTrigger><SelectValue placeholder="Chọn quy cách đầu ra" /></SelectTrigger>
                    <SelectContent>
                      {OUTPUT_STAGE_CODES.filter((c) => c !== inputStageCode).map((c) => (
                        <SelectItem key={c} value={c}>{FINISHED_SPEC_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {bags > 0 && outputStageCode && outputBagSize && (
                  <div className="bg-primary-light rounded-lg p-3 text-sm text-primary-strong">
                    Lấy ra <b>{bags.toLocaleString("vi-VN")} túi</b> ({qty.toLocaleString("vi-VN")} cây) — dự kiến ra:{" "}
                    <b>{qty.toLocaleString("vi-VN")} cây</b> (giữ nguyên số cây, chỉ đổi cách đóng gói — ≈
                    {Math.ceil(qty / outputBagSize).toLocaleString("vi-VN")} túi {outputStageCode})
                  </div>
                )}
              </>
            )}

            <Button
              className="w-full bg-primary hover:bg-primary-hover"
              disabled={submitting || !selectedLot || bags <= 0 || !outputStageCode}
              onClick={onSubmit}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Tạo chỉ định
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
