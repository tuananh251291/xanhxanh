"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Recycle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Room = { id: string; code: string; name: string; warehouse: { code: string; name: string } };
type PlantType = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };

const STAGE_OPTIONS = [
  { value: "T01", label: "T01 (túi 1 cây)" },
  { value: "T05", label: "T05 (túi 5 cây)" },
  { value: "T10", label: "T10 (túi 10 cây)" },
];

export default function ProcessingTicketForm({ rooms, plantTypes }: { rooms: Room[]; plantTypes: PlantType[] }) {
  const [roomId, setRoomId] = useState("");
  const [plantTypeId, setPlantTypeId] = useState("");
  const [inputStageCode, setInputStageCode] = useState("T10");
  const [inputQuantity, setInputQuantity] = useState("");
  const [outputStageCode, setOutputStageCode] = useState("T01");
  const [outputQuantity, setOutputQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [available, setAvailable] = useState<number | null>(null);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const roomOptions: ComboOption[] = rooms.map((r) => ({ value: r.id, label: `${r.warehouse.name} — ${r.name}` }));
  const plantTypeOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));

  useEffect(() => {
    if (!roomId || !plantTypeId || !inputStageCode) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    setLoadingAvailable(true);
    fetch(`/api/processing-tickets/available-quantity?roomId=${roomId}&plantTypeId=${plantTypeId}&stageCode=${inputStageCode}`)
      .then((res) => res.json())
      .then((json) => { if (!cancelled) setAvailable(typeof json.available === "number" ? json.available : null); })
      .finally(() => { if (!cancelled) setLoadingAvailable(false); });
    return () => { cancelled = true; };
  }, [roomId, plantTypeId, inputStageCode]);

  const reset = () => {
    setRoomId(""); setPlantTypeId(""); setInputStageCode("T10"); setInputQuantity("");
    setOutputStageCode("T01"); setOutputQuantity(""); setNotes(""); setDueAt(""); setAvailable(null);
  };

  const submit = async () => {
    const inputQty = Number(inputQuantity);
    const outputQty = Number(outputQuantity);
    if (!roomId) { toast.error("Chọn Phòng khả dụng"); return; }
    if (!plantTypeId) { toast.error("Chọn loại cây"); return; }
    if (!inputQty || inputQty <= 0) { toast.error("Nhập số lượng đầu vào hợp lệ"); return; }
    if (!outputQty || outputQty <= 0) { toast.error("Nhập số lượng đầu ra hợp lệ"); return; }
    if (outputQty > inputQty) { toast.error("Số lượng đầu ra không được lớn hơn số lượng đầu vào"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/processing-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId, plantTypeId, inputStageCode, inputQuantity: inputQty,
          outputStageCode, outputQuantity: outputQty,
          notes: notes.trim() || undefined,
          dueAt: dueAt || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã tạo phiếu xử lý ${json.code}`);
      reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tạo phiếu xử lý</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Phòng khả dụng *</Label>
            <Select items={roomOptions} value={roomId || undefined} onValueChange={(v) => setRoomId(v as string)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
              <SelectContent>
                {roomOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Loại cây *</Label>
            <Combobox
              items={plantTypeOptions}
              value={plantTypeOptions.find((o) => o.value === plantTypeId) ?? null}
              isItemEqualToValue={(a, b) => a.value === b.value}
              onValueChange={(v) => setPlantTypeId(v?.value ?? "")}
            >
              <ComboboxInputGroup>
                <ComboboxInput placeholder="Gõ mã hoặc tên cây…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy loại cây</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-divider">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-primary-strong">Đầu vào cần xử lý</p>
            <div className="space-y-1">
              <Label>Quy cách *</Label>
              <Select items={STAGE_OPTIONS} value={inputStageCode} onValueChange={(v) => setInputStageCode(v as string)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Số lượng *</Label>
              <Input type="number" min={1} value={inputQuantity} onChange={(e) => setInputQuantity(e.target.value)} placeholder="0" />
              <p className="text-xs text-text-secondary">
                {loadingAvailable ? "Đang tải tồn khả dụng…" : available !== null ? `Tồn khả dụng: ${available.toLocaleString("vi-VN")} cây` : "Chọn phòng, loại cây, quy cách để xem tồn khả dụng"}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-primary-strong">Đầu ra</p>
            <div className="space-y-1">
              <Label>Quy cách *</Label>
              <Select items={STAGE_OPTIONS} value={outputStageCode} onValueChange={(v) => setOutputStageCode(v as string)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Số lượng *</Label>
              <Input type="number" min={1} value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-divider">
          <div className="space-y-1">
            <Label>Ghi chú</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: Xử lý lá vàng..." />
          </div>
          <div className="space-y-1">
            <Label>Thời gian cần đáp ứng</Label>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>

        <Button className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Recycle className="w-4 h-4 mr-2" />}
          Tạo phiếu xử lý
        </Button>
      </CardContent>
    </Card>
  );
}
