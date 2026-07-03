"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sliders, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MOTHER_SPEC_LABELS } from "@/types";

type MediumType = { id: string; code: string; name: string };
type Spec = { stageCode: string; motherSampleRatio: number; rootingRatio: number; mediumTypeId: string };
type SpecForm = { motherSampleRatio: string; rootingRatio: string; mediumTypeId: string };

const STAGE_CODES = ["M3", "M5"] as const;

export default function PlantTypeSpecDialog({ plantTypeId, plantTypeName }: { plantTypeId: string; plantTypeName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mediumTypes, setMediumTypes] = useState<MediumType[]>([]);
  const [form, setForm] = useState<Record<string, SpecForm>>({
    M3: { motherSampleRatio: "", rootingRatio: "", mediumTypeId: "" },
    M5: { motherSampleRatio: "", rootingRatio: "", mediumTypeId: "" },
  });
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/medium-types").then((r) => r.json()),
      fetch(`/api/plant-type-specs?plantTypeId=${plantTypeId}`).then((r) => r.json()),
    ]).then(([mediums, specs]: [MediumType[], Spec[]]) => {
      setMediumTypes(mediums);
      setForm((prev) => {
        const next = { ...prev };
        for (const s of specs) {
          next[s.stageCode] = {
            motherSampleRatio: String(s.motherSampleRatio),
            rootingRatio: String(s.rootingRatio),
            mediumTypeId: s.mediumTypeId,
          };
        }
        return next;
      });
    });
  }, [open, plantTypeId]);

  const setField = (stageCode: string, field: keyof SpecForm, value: string) => {
    setForm((prev) => ({ ...prev, [stageCode]: { ...prev[stageCode], [field]: value } }));
  };

  const onSubmit = async () => {
    const changes = STAGE_CODES.filter((sc) => form[sc].motherSampleRatio && form[sc].rootingRatio && form[sc].mediumTypeId)
      .map((sc) => ({
        plantTypeId,
        stageCode: sc,
        motherSampleRatio: Number(form[sc].motherSampleRatio),
        rootingRatio: Number(form[sc].rootingRatio),
        mediumTypeId: form[sc].mediumTypeId,
      }));
    if (changes.length === 0) {
      toast.error("Điền đủ tỉ lệ + môi trường cho ít nhất 1 quy cách");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/plant-type-specs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã lưu quy cách");
      setOpen(false);
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" title="Cấu hình quy cách M3/M5" />}>
        <Sliders className="w-4 h-4" />
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Quy cách nhân giống — {plantTypeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-xs text-gray-500">
            Tỉ lệ nhân/môi trường mặc định theo quy cách mẫu mẹ — dùng để tự điền khi Kỹ thuật tạo chỉ định cấy.
          </p>
          {STAGE_CODES.map((sc) => (
            <div key={sc} className="border rounded-lg p-3 space-y-3">
              <p className="text-sm font-medium">{MOTHER_SPEC_LABELS[sc]}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tỉ lệ nhân mẫu mẹ</Label>
                  <Input
                    type="number" step="0.1" min="0" placeholder="3.0"
                    value={form[sc].motherSampleRatio}
                    onChange={(e) => setField(sc, "motherSampleRatio", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tỉ lệ ra rễ</Label>
                  <Input
                    type="number" step="0.1" min="0" placeholder="0.8"
                    value={form[sc].rootingRatio}
                    onChange={(e) => setField(sc, "rootingRatio", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Môi trường</Label>
                <Select value={form[sc].mediumTypeId || undefined} onValueChange={(v) => setField(sc, "mediumTypeId", v as string)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Chọn môi trường" /></SelectTrigger>
                  <SelectContent>
                    {mediumTypes.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-green-600 hover:bg-green-700" disabled={loading} onClick={onSubmit}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
