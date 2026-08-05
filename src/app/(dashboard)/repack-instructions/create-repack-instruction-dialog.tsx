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

export default function CreateRepackInstructionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lots, setLots] = useState<FinishedLot[]>([]);
  const [shelfId, setShelfId] = useState("");
  const [lotId, setLotId] = useState("");
  const [inputQuantity, setInputQuantity] = useState("");
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
      setShelfId(""); setLotId(""); setInputQuantity(""); setOutputStageCode("");
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
  const selectedLot = lotsOnShelf.find((l) => l.id === lotId);
  const qty = Number(inputQuantity) || 0;
  const bagSize = outputStageCode ? FINISHED_SPEC_BAG_SIZE[outputStageCode as keyof typeof FINISHED_SPEC_BAG_SIZE] : null;

  const onSubmit = async () => {
    if (!selectedLot) { toast.error("Chọn lô nguồn trước"); return; }
    if (qty <= 0 || qty > selectedLot.quantity) { toast.error("Số lượng đầu vào không hợp lệ"); return; }
    if (!outputStageCode) { toast.error("Chọn quy cách đầu ra"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/repack-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceShelfId: shelfId, sourceLotId: lotId, inputQuantity: qty, outputStageCode }),
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
                onValueChange={(v) => { setShelfId(v as string); setLotId(""); }}
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
                <Label>Lô nguồn</Label>
                <Select
                  items={lotsOnShelf.map((l) => ({ value: l.id, label: `${l.plantType.code} — ${l.stageCode} — còn ${l.quantity.toLocaleString("vi-VN")} cây` }))}
                  value={lotId || null}
                  onValueChange={(v) => setLotId(v as string)}
                >
                  <SelectTrigger><SelectValue placeholder="Chọn lô nguồn" /></SelectTrigger>
                  <SelectContent>
                    {lotsOnShelf.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.plantType.code} — {l.stageCode} — còn {l.quantity.toLocaleString("vi-VN")} cây
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {lotsOnShelf.length === 0 && <p className="text-xs text-text-muted">Kệ này không còn lô nào</p>}
              </div>
            )}

            {selectedLot && (
              <>
                <div className="space-y-1">
                  <Label>Số lượng đầu vào (cây, tối đa {selectedLot.quantity.toLocaleString("vi-VN")})</Label>
                  <Input
                    type="number" min={1} max={selectedLot.quantity}
                    value={inputQuantity} onChange={(e) => setInputQuantity(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Quy cách đầu ra</Label>
                  <Select
                    items={OUTPUT_STAGE_CODES.filter((c) => c !== selectedLot.stageCode).map((c) => ({ value: c, label: FINISHED_SPEC_LABELS[c] }))}
                    value={outputStageCode || null}
                    onValueChange={(v) => setOutputStageCode(v as string)}
                  >
                    <SelectTrigger><SelectValue placeholder="Chọn quy cách đầu ra" /></SelectTrigger>
                    <SelectContent>
                      {OUTPUT_STAGE_CODES.filter((c) => c !== selectedLot.stageCode).map((c) => (
                        <SelectItem key={c} value={c}>{FINISHED_SPEC_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {qty > 0 && outputStageCode && bagSize && (
                  <div className="bg-primary-light rounded-lg p-3 text-sm text-primary-strong">
                    Dự kiến ra: <b>{qty.toLocaleString("vi-VN")} cây</b> (giữ nguyên số cây, chỉ đổi cách
                    đóng gói — ≈{Math.ceil(qty / bagSize).toLocaleString("vi-VN")} túi {outputStageCode})
                  </div>
                )}
              </>
            )}

            <Button
              className="w-full bg-primary hover:bg-primary-hover"
              disabled={submitting || !selectedLot || qty <= 0 || !outputStageCode}
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
