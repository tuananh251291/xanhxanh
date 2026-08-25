"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Room = { id: string; name: string; type: string };
type Garden = { id: string; code: string; name: string };
type Lot = { id: string; plantTypeId: string; stageCode: string; quantity: number; plantType: { code: string; name: string } };

export default function DeXuatExecuteForm({
  taskId, taskCode, taskTitle, rooms, gardens, initialRoomId,
}: {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  rooms: Room[];
  gardens: Garden[];
  initialRoomId: string | null;
}) {
  const router = useRouter();
  const [roomId, setRoomId] = useState(initialRoomId ?? "");
  const [lots, setLots] = useState<Lot[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [values, setValues] = useState<Record<string, { huy: string; trong: string }>>({});
  const [productionGardenId, setProductionGardenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadLots = useCallback(async (id: string) => {
    setLoadingLots(true);
    setValues({});
    try {
      const res = await fetch(`/api/lots?roomId=${id}&status=ACTIVE`);
      const data = await res.json();
      setLots(Array.isArray(data) ? data : []);
    } finally {
      setLoadingLots(false);
    }
  }, []);

  useEffect(() => { if (roomId) loadLots(roomId); }, [roomId, loadLots]);

  const getValue = (lotId: string) => values[lotId] ?? { huy: "", trong: "" };
  const setValue = (lotId: string, patch: Partial<{ huy: string; trong: string }>) =>
    setValues((prev) => ({ ...prev, [lotId]: { ...getValue(lotId), ...patch } }));

  const submit = async () => {
    const rows = lots
      .map((l) => ({ lot: l, huy: parseInt(getValue(l.id).huy, 10) || 0, trong: parseInt(getValue(l.id).trong, 10) || 0 }))
      .filter((r) => r.huy > 0 || r.trong > 0);
    if (rows.length === 0) { toast.error("Chưa nhập số lượng dòng nào"); return; }
    for (const r of rows) {
      if (r.huy > r.lot.quantity || r.trong > r.lot.quantity) { toast.error(`${r.lot.plantType.code}: số lượng vượt quá tồn kho`); return; }
      if (r.trong > 0 && !productionGardenId) { toast.error("Chưa chọn Vườn sản xuất cho dòng Trồng"); return; }
    }

    setSubmitting(true);
    let batchCode: string | undefined;
    let successCount = 0;
    try {
      for (const r of rows) {
        const calls: { type: "HUY" | "TRONG"; quantity: number }[] = [];
        if (r.huy > 0) calls.push({ type: "HUY", quantity: r.huy });
        if (r.trong > 0) calls.push({ type: "TRONG", quantity: r.trong });
        for (const c of calls) {
          const res = await fetch("/api/contamination-proposals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: c.type,
              roomId,
              plantTypeId: r.lot.plantTypeId,
              stageCode: r.lot.stageCode,
              quantity: c.quantity,
              batchCode,
              dailyTaskId: taskId,
              productionGardenId: c.type === "TRONG" ? productionGardenId : undefined,
            }),
          });
          if (!res.ok) { toast.error((await res.json()).message ?? "Có dòng gửi thất bại"); continue; }
          const created = await res.json();
          if (!batchCode) batchCode = created.batchCode ?? created.code;
          successCount += 1;
        }
      }
      if (successCount > 0) {
        toast.success(`Đã gửi ${successCount} đề xuất cho Admin duyệt`);
        router.push("/task-assignment");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/task-assignment">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{taskTitle}</h1>
          <p className="text-text-secondary text-sm font-mono">{taskCode}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Chọn phòng</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <Select
            items={rooms.map((r) => ({ value: r.id, label: r.name }))}
            value={roomId || null}
            onValueChange={(v) => setRoomId(v as string)}
          >
            <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Chọn phòng cần kiểm tra" /></SelectTrigger>
            <SelectContent>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {roomId && (
        <Card>
          <CardHeader><CardTitle className="text-base">Tồn kho trong phòng — nhập số lượng đề xuất</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loadingLots ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
            ) : lots.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">Phòng này không có lô nào đang tồn</p>
            ) : (
              <>
                <div className="border border-divider rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tên cây</th>
                        <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                        <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                        <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Tồn kho</th>
                        <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-28">Đề xuất hủy</th>
                        <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-28">Đề xuất trồng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lots.map((l) => (
                        <tr key={l.id} className="border-t border-divider even:bg-primary-light/30">
                          <td className="px-3 py-2 text-foreground">{l.plantType.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-text-secondary">{l.plantType.code}</td>
                          <td className="px-3 py-2 text-text-secondary">{l.stageCode}</td>
                          <td className="px-3 py-2 text-right text-text-secondary">{l.quantity.toLocaleString("vi-VN")}</td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number" min={0} max={l.quantity} className="h-9 text-right"
                              value={getValue(l.id).huy}
                              onChange={(e) => setValue(l.id, { huy: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number" min={0} max={l.quantity} className="h-9 text-right"
                              value={getValue(l.id).trong}
                              onChange={(e) => setValue(l.id, { trong: e.target.value })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-1 max-w-sm">
                  <Label>Vườn sản xuất <span className="text-text-muted font-normal">(áp dụng cho mọi dòng Trồng đã nhập)</span></Label>
                  <Select
                    items={gardens.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
                    value={productionGardenId}
                    onValueChange={(v) => setProductionGardenId(v as string)}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Chọn vườn" /></SelectTrigger>
                    <SelectContent>
                      {gardens.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name} ({g.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Tạo phiếu đề xuất
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
