"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { ArrowRight, ArrowLeftRight, Plus, Trash2, Loader2, TriangleAlert, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export type StockOption = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number };
export type MoveHistory = {
  id: string;
  code: string;
  notes: string | null;
  createdAt: string;
  fromRoom: { name: string };
  toRoom: { name: string };
  createdBy: { name: string };
  items: { stageCode: string; quantity: number; plantType: { code: string; name: string } }[];
};
type Direction = "TO_PROCESSING" | "TO_STANDARD";
type ComboOption = { value: string; label: string };
type Row = { key: number; comboKey: string; quantity: string };

const fmt = (n: number) => n.toLocaleString("vi-VN");
const keyOf = (s: { plantTypeId: string; stageCode: string }) => `${s.plantTypeId}:${s.stageCode}`;
const emptyRow = (key: number): Row => ({ key, comboKey: "", quantity: "" });

// Luân chuyển nội bộ Phòng đạt tiêu chuẩn ⇄ Phòng chờ xử lý — chọn chiều, thêm nhiều dòng (mã cây + quy
// cách + số lượng), xác nhận rồi gửi 1 lần. Số "còn chuyển được" đã trừ phần đơn hàng/Phiếu xử lý đang giữ.
export default function RoomMoveBoard({
  standardRoomName, processingRoomName, standardStock, processingStock, history,
}: {
  standardRoomName: string;
  processingRoomName: string;
  standardStock: StockOption[];
  processingStock: StockOption[];
  history: MoveHistory[];
}) {
  const router = useRouter();
  const rowKeyRef = useRef(1);
  const [direction, setDirection] = useState<Direction>("TO_PROCESSING");
  const [rows, setRows] = useState<Row[]>([emptyRow(0)]);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stock = direction === "TO_PROCESSING" ? standardStock : processingStock;
  const fromName = direction === "TO_PROCESSING" ? standardRoomName : processingRoomName;
  const toName = direction === "TO_PROCESSING" ? processingRoomName : standardRoomName;

  const stockByKey = useMemo(() => new Map(stock.map((s) => [keyOf(s), s])), [stock]);
  const comboOptions: ComboOption[] = useMemo(
    () => stock.map((s) => ({ value: keyOf(s), label: `${s.plantTypeCode} ${s.plantTypeName} — ${s.stageCode} (${fmt(s.quantity)} cây)` })),
    [stock]
  );

  const switchDirection = (d: Direction) => {
    if (d === direction) return;
    setDirection(d);
    setRows([emptyRow(rowKeyRef.current++)]);
  };
  const updateRow = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, emptyRow(rowKeyRef.current++)]);
  const removeRow = (key: number) => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));

  const filledRows = rows.filter((r) => r.comboKey || r.quantity);
  const totalQty = filledRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  const validate = () => {
    if (filledRows.length === 0) { toast.error("Chưa nhập dòng nào"); return false; }
    const used = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.comboKey && !row.quantity) continue;
      if (!stockByKey.has(row.comboKey)) { toast.error(`Dòng ${i + 1}: chọn mã cây + quy cách`); return false; }
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) { toast.error(`Dòng ${i + 1}: nhập số lượng chuyển`); return false; }
      used.set(row.comboKey, (used.get(row.comboKey) ?? 0) + qty);
    }
    for (const [k, qty] of used) {
      const s = stockByKey.get(k)!;
      if (qty > s.quantity) { toast.error(`${s.plantTypeCode} ${s.stageCode}: vượt số còn chuyển được (${fmt(s.quantity)} cây)`); return false; }
    }
    return true;
  };

  const send = async () => {
    setSubmitting(true);
    try {
      const lines = filledRows.map((r) => {
        const s = stockByKey.get(r.comboKey)!;
        return { plantTypeId: s.plantTypeId, stageCode: s.stageCode, quantity: Number(r.quantity) || 0 };
      });
      const res = await fetch("/api/room-moves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, lines, notes: notes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Luân chuyển thất bại"); return; }
      toast.success(`Đã luân chuyển — phiếu ${json.code}`);
      setRows([emptyRow(rowKeyRef.current++)]);
      setNotes("");
      router.refresh();
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6 text-primary-strong" /> Luân chuyển nội bộ
        </h1>
        <p className="text-text-secondary text-sm mt-1">Chuyển cây qua lại giữa {standardRoomName} và {processingRoomName} — tồn kho đổi ngay khi xác nhận.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chiều luân chuyển</CardTitle>
          <div className="flex flex-wrap gap-2 pt-1">
            {(["TO_PROCESSING", "TO_STANDARD"] as const).map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={direction === d ? "default" : "outline"}
                onClick={() => switchDirection(d)}
              >
                {d === "TO_PROCESSING" ? standardRoomName : processingRoomName}
                <ArrowRight className="w-3.5 h-3.5 mx-1.5" />
                {d === "TO_PROCESSING" ? processingRoomName : standardRoomName}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-text-secondary">
            Số trong ngoặc là số còn chuyển được của {fromName}
            {direction === "TO_PROCESSING" ? " (đã trừ phần đơn hàng đang giữ)" : " (đã trừ phần Phiếu xử lý chưa bàn giao đang giữ)"}.
          </p>

          {stock.length === 0 ? (
            <p className="text-sm text-text-muted py-2">{fromName} không còn cây nào chuyển được.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[640px] space-y-2">
                  <div className="grid grid-cols-[2fr_9rem_9rem_2.5rem] gap-2 text-sm text-primary-strong font-bold px-1">
                    <span>Mã cây + quy cách</span>
                    <span>Còn chuyển được</span>
                    <span>Số lượng chuyển</span>
                    <span />
                  </div>
                  {rows.map((row) => {
                    const s = stockByKey.get(row.comboKey);
                    return (
                      <div key={row.key} className="grid grid-cols-[2fr_9rem_9rem_2.5rem] gap-2 items-center border border-divider rounded-lg p-2">
                        <Combobox
                          items={comboOptions}
                          value={comboOptions.find((o) => o.value === row.comboKey) ?? null}
                          isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                          onValueChange={(v) => updateRow(row.key, { comboKey: v ? (v as ComboOption).value : "", quantity: "" })}
                        >
                          <ComboboxInputGroup className="w-full h-9">
                            <ComboboxInput className="text-xs" placeholder="Gõ mã cây hoặc tên cây…" />
                            <ComboboxTrigger />
                          </ComboboxInputGroup>
                          <ComboboxContent>
                            <ComboboxEmpty>Không tìm thấy mã cây</ComboboxEmpty>
                            <ComboboxList>
                              {(item: ComboOption) => <ComboboxItem key={item.value} value={item} className="text-xs">{item.label}</ComboboxItem>}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                        <div className="text-sm text-foreground text-center">{s ? `${fmt(s.quantity)} cây` : "—"}</div>
                        <Input
                          type="number" min={1} max={s?.quantity} className="h-9 text-xs"
                          value={row.quantity}
                          disabled={!s}
                          onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                          placeholder={s ? "Số cây" : "—"}
                        />
                        <Button
                          type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-danger-light"
                          disabled={rows.length <= 1}
                          onClick={() => removeRow(row.key)}
                          title="Xoá dòng"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Thêm dòng
              </Button>

              <div className="space-y-1">
                <Label>Ghi chú <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="VD: chuyển sang xử lý lá vàng…" />
              </div>

              <Button className="w-full" disabled={submitting} onClick={() => { if (validate()) setConfirmOpen(true); }}>
                <Send className="w-4 h-4 mr-2" /> Luân chuyển {filledRows.length > 0 ? `${filledRows.length} dòng` : ""}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lịch sử luân chuyển</CardTitle></CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">Chưa có phiếu luân chuyển nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã phiếu</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Thời gian</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Chiều</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Chi tiết</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Người tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((m) => (
                    <tr key={m.id} className="border-b border-divider last:border-0 even:bg-primary-light/30 align-top">
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{m.code}</td>
                      <td className="px-4 py-2 text-text-secondary whitespace-nowrap">{format(new Date(m.createdAt), "dd/MM/yyyy HH:mm")}</td>
                      <td className="px-4 py-2 text-foreground whitespace-nowrap">{m.fromRoom.name} → {m.toRoom.name}</td>
                      <td className="px-4 py-2">
                        {m.items.map((it, i) => (
                          <p key={i} className="text-foreground">
                            <span className="font-mono text-text-secondary">{it.plantType.code}</span> {it.plantType.name} ({it.stageCode}): <span className="font-medium">{fmt(it.quantity)}</span>
                          </p>
                        ))}
                        {m.notes && <p className="text-xs text-text-muted mt-0.5">{m.notes}</p>}
                      </td>
                      <td className="px-4 py-2 text-text-secondary whitespace-nowrap">{m.createdBy.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!submitting) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Xác nhận luân chuyển</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground">
            {fromName} → {toName}: {filledRows.length} dòng, tổng {fmt(totalQty)} cây
          </p>
          <div className="flex items-start gap-2 text-sm font-medium text-warning-foreground bg-warning-light rounded-lg p-3">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            Kiểm tra lại: đây là số cây, không phải số túi. Tồn kho 2 phòng đổi ngay khi xác nhận.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>Kiểm tra lại</Button>
            <Button onClick={send} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
