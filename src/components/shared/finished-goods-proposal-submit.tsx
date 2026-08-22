"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Room = { id: string; name: string; type: string };
type Lot = { id: string; plantTypeId: string; stageCode: string; quantity: number; plantType: { code: string; name: string } };
type Line = { roomId: string; lotId: string; quantity: number; type: "HUY" | "TRONG" };

const emptyLine: Line = { roomId: "", lotId: "", quantity: 0, type: "HUY" };

// Gửi đề xuất Trồng/Hủy cho cây thành phẩm thật đang có trong kho — khác luồng Kho mô (dark-room
// contamination, xem contamination-draft-submit.tsx): không có bước "Gộp phiếu"/số dư theo NV vì NV
// Kho thành phẩm chọn thẳng lô ACTIVE đang thấy thật trong phòng, gửi thẳng lên PENDING cho Admin duyệt.
export default function FinishedGoodsProposalSubmit({ rooms }: { rooms: Room[] }) {
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [lotsByRoom, setLotsByRoom] = useState<Record<string, Lot[]>>({});
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const roomLabel = (r: Room) => r.name;

  const loadLots = async (roomId: string) => {
    if (lotsByRoom[roomId]) return;
    setLoadingRoomId(roomId);
    try {
      const res = await fetch(`/api/lots?roomId=${roomId}&status=ACTIVE`);
      const data = await res.json();
      setLotsByRoom((prev) => ({ ...prev, [roomId]: Array.isArray(data) ? data : [] }));
    } finally {
      setLoadingRoomId(null);
    }
  };

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const setRoom = (idx: number, roomId: string) => {
    updateLine(idx, { roomId, lotId: "" });
    loadLots(roomId);
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const getLot = (line: Line) => lotsByRoom[line.roomId]?.find((l) => l.id === line.lotId);

  const submit = async () => {
    const validLines = lines.filter((l) => l.roomId && l.lotId && l.quantity > 0);
    if (validLines.length === 0) { toast.error("Chưa nhập dòng nào hợp lệ"); return; }
    for (const l of validLines) {
      const lot = getLot(l);
      if (!lot || l.quantity > lot.quantity) { toast.error("Có dòng vượt quá số lượng tồn của lô"); return; }
    }

    setSubmitting(true);
    let batchCode: string | undefined;
    let successCount = 0;
    try {
      for (const l of validLines) {
        const lot = getLot(l)!;
        const res = await fetch("/api/contamination-proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: l.type,
            roomId: l.roomId,
            plantTypeId: lot.plantTypeId,
            stageCode: lot.stageCode,
            quantity: l.quantity,
            batchCode,
          }),
        });
        if (!res.ok) { toast.error((await res.json()).message ?? "Có dòng gửi thất bại"); continue; }
        const created = await res.json();
        if (!batchCode) batchCode = created.batchCode ?? created.code;
        successCount += 1;
      }
      if (successCount > 0) {
        toast.success(`Đã gửi ${successCount} đề xuất`);
        setLines([{ ...emptyLine }]);
        setLotsByRoom({});
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Gửi đề xuất Trồng/Hủy</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="w-4 h-4 mr-1" /> Thêm dòng
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {lines.map((line, idx) => {
          const lots = lotsByRoom[line.roomId] ?? [];
          const lot = getLot(line);
          return (
            <div key={idx} className="flex flex-wrap items-center gap-2 border-b border-divider pb-3 last:border-0 last:pb-0">
              <div className="min-w-0 flex-1 basis-full sm:basis-56 space-y-1">
                <Label className="text-xs">Phòng</Label>
                <Select
                  items={rooms.map((r) => ({ value: r.id, label: roomLabel(r) }))}
                  value={line.roomId || null}
                  onValueChange={(v) => setRoom(idx, v as string)}
                >
                  <SelectTrigger><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                  <SelectContent>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{roomLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 flex-1 basis-full sm:basis-64 space-y-1">
                <Label className="text-xs">Lô</Label>
                <Select
                  items={lots.map((l) => ({ value: l.id, label: `${l.plantType.code} — ${l.plantType.name} (${l.stageCode}, còn ${l.quantity.toLocaleString("vi-VN")})` }))}
                  value={line.lotId || null}
                  onValueChange={(v) => updateLine(idx, { lotId: v as string })}
                >
                  <SelectTrigger disabled={!line.roomId || loadingRoomId === line.roomId}>
                    <SelectValue placeholder={loadingRoomId === line.roomId ? "Đang tải..." : "Chọn lô"} />
                  </SelectTrigger>
                  <SelectContent>
                    {lots.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.plantType.code} — {l.plantType.name} ({l.stageCode}, còn {l.quantity.toLocaleString("vi-VN")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">Số lượng</Label>
                <Input
                  type="number" min={1} max={lot?.quantity}
                  value={line.quantity || ""}
                  onChange={(e) => updateLine(idx, { quantity: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-xs">Loại</Label>
                <Select items={[{ value: "HUY", label: "Hủy" }, { value: "TRONG", label: "Trồng" }]} value={line.type} onValueChange={(v) => updateLine(idx, { type: v as Line["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HUY">Hủy</SelectItem>
                    <SelectItem value="TRONG">Trồng</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(idx)} disabled={lines.length === 1}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          );
        })}

        <Button className="w-full bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Gửi đề xuất Trồng/Hủy
        </Button>
      </CardContent>
    </Card>
  );
}
