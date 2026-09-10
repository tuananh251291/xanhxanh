"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Loader2, Plus, Sprout, Calendar, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format, addWeeks } from "date-fns";
import { vi } from "date-fns/locale";
import { INSTRUCTION_STATUS_LABELS } from "@/types";

type InstructionRow = {
  id: string;
  code: string;
  status: keyof typeof INSTRUCTION_STATUS_LABELS;
  weekStart: string | null;
  inputMotherQuantity: number;
  createdAt: string;
  previousInstructionId: string | null;
  plantType: { code: string; name: string; transferWaitWeeks: number };
  items: { motherMedium: { code: string; name: string } | null }[];
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-warning-light text-warning-foreground",
  ACTIVE: "bg-primary-light text-primary-strong",
  ENDED: "bg-info-light text-info-foreground",
  COMPLETED: "bg-success-light text-success-foreground",
  CANCELLED: "bg-danger-light text-destructive",
};

export default function RndProductionBoard() {
  const [instructions, setInstructions] = useState<InstructionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rnd-production/instructions");
      const data = await res.json();
      setInstructions(Array.isArray(data.instructions) ? data.instructions : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Danh sách chỉ định cấy R&D của bạn</CardTitle>
            <CreateInstructionDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => { setCreateOpen(false); load(); }} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
          ) : instructions.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-12">Chưa có chỉ định cấy R&D nào — bấm &quot;Tạo chỉ định cấy&quot; để bắt đầu</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light text-left text-primary-strong">
                    <th className="py-2 px-3 font-bold text-base">Mã chỉ định</th>
                    <th className="py-2 px-3 font-bold text-base">Mã cây</th>
                    <th className="py-2 px-3 font-bold text-base">Môi trường</th>
                    <th className="py-2 px-3 font-bold text-base text-center">SL mẫu mẹ</th>
                    <th className="py-2 px-3 font-bold text-base">Tuần thực hiện</th>
                    <th className="py-2 px-3 font-bold text-base">Dự kiến đến hạn</th>
                    <th className="py-2 px-3 font-bold text-base">Trạng thái</th>
                    <th className="py-2 px-3 font-bold text-base"></th>
                  </tr>
                </thead>
                <tbody>
                  {instructions.map((inst) => {
                    const expectedReadyAt = inst.weekStart
                      ? addWeeks(new Date(inst.weekStart), inst.plantType.transferWaitWeeks)
                      : null;
                    const medium = inst.items[0]?.motherMedium;
                    return (
                      <tr key={inst.id} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="py-2 px-3 font-mono text-info-foreground">
                          {inst.code}
                          {inst.previousInstructionId && <span className="text-text-muted text-xs ml-1">(kì tiếp)</span>}
                        </td>
                        <td className="py-2 px-3">{inst.plantType.code} — {inst.plantType.name}</td>
                        <td className="py-2 px-3 text-text-secondary">{medium ? `${medium.code} — ${medium.name}` : "—"}</td>
                        <td className="py-2 px-3 text-center tabular-nums">{inst.inputMotherQuantity.toLocaleString("vi-VN")}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {inst.weekStart ? format(new Date(inst.weekStart), "dd/MM/yyyy", { locale: vi }) : "Chưa xác nhận"}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-text-secondary">
                          {expectedReadyAt ? format(expectedReadyAt, "dd/MM/yyyy", { locale: vi }) : "—"}
                        </td>
                        <td className="py-2 px-3">
                          <Badge className={STATUS_BADGE[inst.status]}>{INSTRUCTION_STATUS_LABELS[inst.status]}</Badge>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {inst.status === "DRAFT" && <ConfirmStartDialog instructionId={inst.id} onConfirmed={load} />}
                          {inst.status === "ACTIVE" && (
                            <Link href={`/rnd-production/${inst.id}`}>
                              <Button type="button" variant="outline" size="sm">
                                <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Nhập kết quả
                              </Button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type ComboOption = { value: string; label: string };
type PlantType = { id: string; code: string; name: string };
type MediumType = { id: string; code: string; name: string };

function CreateInstructionDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [mediumTypes, setMediumTypes] = useState<MediumType[]>([]);
  const [plantTypeOption, setPlantTypeOption] = useState<ComboOption | null>(null);
  const [mediumTypeOption, setMediumTypeOption] = useState<ComboOption | null>(null);
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/plant-types").then((r) => r.json()).then((data: PlantType[]) => setPlantTypes(Array.isArray(data) ? data : []));
    fetch("/api/medium-types").then((r) => r.json()).then((data: MediumType[]) => setMediumTypes(Array.isArray(data) ? data : []));
  }, [open]);

  const plantTypeOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
  const mediumTypeOptions: ComboOption[] = mediumTypes.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }));

  const reset = () => { setPlantTypeOption(null); setMediumTypeOption(null); setQuantity(""); };

  const canSubmit = !!plantTypeOption && !!mediumTypeOption && quantity.trim() && !saving;

  const submit = async () => {
    if (!canSubmit || !plantTypeOption || !mediumTypeOption) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rnd-production/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantTypeId: plantTypeOption.value,
          mediumTypeId: mediumTypeOption.value,
          quantity: Number(quantity),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Tạo chỉ định cấy thất bại"); return; }
      toast.success(`Đã tạo chỉ định ${data.code}`);
      reset();
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button className="bg-primary hover:bg-primary-hover" />}>
        <Plus className="w-4 h-4 mr-1.5" /> Tạo chỉ định cấy
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sprout className="w-5 h-5" /> Tạo chỉ định cấy cho tôi</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">Mã cây <span className="text-destructive">*</span></Label>
            <Combobox
              items={plantTypeOptions}
              value={plantTypeOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(val) => setPlantTypeOption(val as ComboOption | null)}
            >
              <ComboboxInputGroup>
                <ComboboxInput placeholder="Gõ mã/tên cây…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy mã cây</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Số lượng mẫu mẹ đưa vào cấy <span className="text-destructive">*</span></Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="VD: 10" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Môi trường <span className="text-destructive">*</span></Label>
            <Combobox
              items={mediumTypeOptions}
              value={mediumTypeOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(val) => setMediumTypeOption(val as ComboOption | null)}
            >
              <ComboboxInputGroup>
                <ComboboxInput placeholder="Gõ mã/tên môi trường…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy môi trường</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={!canSubmit} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Tạo chỉ định
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmStartDialog({ instructionId, onConfirmed }: { instructionId: string; onConfirmed: () => void }) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/rnd-production/instructions/${instructionId}/confirm-start`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Xác nhận thất bại"); return; }
      toast.success("Đã xác nhận ngày bắt đầu kì cấy mới");
      setOpen(false);
      onConfirmed();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" className="bg-primary hover:bg-primary-hover" />}>
        <Calendar className="w-3.5 h-3.5 mr-1.5" /> Xác nhận ngày bắt đầu
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Xác nhận ngày bắt đầu kì cấy mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">Ngày bắt đầu <span className="text-destructive">*</span></Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={saving} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Xác nhận
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
