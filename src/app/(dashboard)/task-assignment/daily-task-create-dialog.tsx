"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DailyTaskType } from "@prisma/client";

const NONE = "NONE";

type PlantType = { id: string; code: string; name: string };
type Room = { id: string; code: string; name: string };
type StaffOption = { id: string; code: string; name: string };

export default function DailyTaskCreateDialog({
  type,
  label,
  plantTypes,
  rooms,
  staffOptions,
}: {
  type: DailyTaskType;
  label: string;
  plantTypes: PlantType[];
  rooms: Room[];
  staffOptions: StaffOption[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"plantType" | "room">("plantType");
  const [selectedPlantTypeIds, setSelectedPlantTypeIds] = useState<string[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const reset = () => {
    setMode("plantType");
    setSelectedPlantTypeIds([]);
    setRoomId(null);
    setAssignedToId(null);
    setNotes("");
  };

  const togglePlantType = (id: string) => {
    setSelectedPlantTypeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (mode === "plantType" && selectedPlantTypeIds.length === 0) { toast.error("Chọn ít nhất 1 Loại cây"); return; }
    if (mode === "room" && !roomId) { toast.error("Chọn 1 Phòng/kho cần kiểm tra"); return; }
    if (!assignedToId) { toast.error("Chọn người phụ trách"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/daily-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          plantTypeIds: mode === "plantType" ? selectedPlantTypeIds : undefined,
          roomId: mode === "room" ? roomId : undefined,
          assignedToId,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã tạo nhiệm vụ");
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={<Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" />}>
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Tạo nhiệm vụ
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Tạo nhiệm vụ — {label}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "plantType" ? "default" : "outline"} className={mode === "plantType" ? "bg-primary hover:bg-primary-hover" : ""} onClick={() => setMode("plantType")}>
              Theo loại cây
            </Button>
            <Button type="button" size="sm" variant={mode === "room" ? "default" : "outline"} className={mode === "room" ? "bg-primary hover:bg-primary-hover" : ""} onClick={() => setMode("room")}>
              Theo phòng/kho
            </Button>
          </div>

          {mode === "plantType" ? (
            <div>
              <Label className="mb-1.5 block">Loại cây cần kiểm tra (chọn nhiều)</Label>
              <div className="border border-border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                {plantTypes.length === 0 ? (
                  <p className="text-xs text-text-muted py-2 text-center">Không có Loại cây nào</p>
                ) : (
                  plantTypes.map((pt) => (
                    <label key={pt.id} className="flex items-center gap-2 text-sm px-1.5 py-1 rounded hover:bg-primary-light cursor-pointer">
                      <Checkbox checked={selectedPlantTypeIds.includes(pt.id)} onCheckedChange={() => togglePlantType(pt.id)} />
                      <span className="font-mono text-xs text-text-secondary">{pt.code}</span> {pt.name}
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div>
              <Label className="mb-1.5 block">Phòng/kho cần kiểm tra</Label>
              <Select
                items={[{ value: NONE, label: "— Chọn phòng —" }, ...rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.code})` }))]}
                value={roomId ?? NONE}
                onValueChange={(v) => setRoomId(v === NONE ? null : (v as string))}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Chọn phòng —</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name} ({r.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">Người phụ trách</Label>
            <Select
              items={[{ value: NONE, label: "— Chọn NV phụ trách —" }, ...staffOptions.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))]}
              value={assignedToId ?? NONE}
              onValueChange={(v) => setAssignedToId(v === NONE ? null : (v as string))}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn NV phụ trách" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Chọn NV phụ trách —</SelectItem>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block">Ghi chú (tuỳ chọn)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Yêu cầu thêm cho người phụ trách..."
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Tạo nhiệm vụ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
