"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox, ComboboxInputGroup, ComboboxInput, ComboboxTrigger, ComboboxContent, ComboboxEmpty, ComboboxList, ComboboxItem } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, PackageOpen, Plus, Send, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Order = { id: string; code: string; status: string; customer: string; saleName: string; notes: string | null; expectedShipAt: string | null; items: string[] };
type ReqItem = { id: string; plantCode: string; plantName: string; stageCode: string; quantity: number; notes: string | null; allocated: number; packed: number; shipped: number };
type Req = {
  id: string; code: string; status: "SENT" | "DONE" | "CANCELLED"; notes: string | null; createdAt: string; doneAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  orderCode: string; customer: string; saleName: string; gardenName: string; packerName: string | null; createdByName: string; items: ReqItem[];
};
type Line = { key: number; plantTypeId: string | null; stageCode: string; quantity: string; notes: string };

const STATUS: Record<Req["status"], { label: string; variant: "in-progress" | "completed" | "overdue" }> = {
  SENT: { label: "Đang đóng gói", variant: "in-progress" },
  DONE: { label: "Đã xuất đủ", variant: "completed" },
  CANCELLED: { label: "Đã huỷ", variant: "overdue" },
};
const fmt = (n: number) => n.toLocaleString("vi-VN");

type Option = { value: string; label: string };
// Ô chọn có tìm kiếm (Combobox base-ui dùng object làm value) — bọc lại để dùng theo id.
function SearchSelect({ items, value, onChange, placeholder }: { items: Option[]; value: string | null; onChange: (v: string | null) => void; placeholder: string }) {
  return (
    <Combobox
      items={items}
      value={items.find((i) => i.value === value) ?? null}
      isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
      onValueChange={(v) => onChange((v as Option | null)?.value ?? null)}
    >
      <ComboboxInputGroup className="h-9 w-full">
        <ComboboxInput placeholder={placeholder} />
        <ComboboxTrigger />
      </ComboboxInputGroup>
      <ComboboxContent>
        <ComboboxEmpty>Không tìm thấy</ComboboxEmpty>
        <ComboboxList>{(item: Option) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export default function PackRequestsBoard({ orders, gardens, plantTypes, sizes, requests }: {
  orders: Order[]; gardens: { id: string; label: string }[]; plantTypes: { id: string; code: string; name: string }[]; sizes: string[]; requests: Req[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [gardenId, setGardenId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, plantTypeId: null, stageCode: "S", quantity: "", notes: "" }]);
  const [cancel, setCancel] = useState<{ req: Req; reason: string } | null>(null);
  const [tab, setTab] = useState<Req["status"]>("SENT");

  const order = orders.find((o) => o.id === orderId) ?? null;
  const plantItems = plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const call = async (url: string, method: "POST" | "PATCH", body: object, onDone: () => void) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(json.message);
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!orderId) { toast.error("Chọn đơn hàng"); return; }
    if (!gardenId) { toast.error("Chọn vườn sản xuất"); return; }
    const items = [];
    for (const l of lines) {
      const q = Number(l.quantity);
      if (!l.plantTypeId) { toast.error("Chọn mã cây cho mọi dòng"); return; }
      if (!Number.isInteger(q) || q <= 0) { toast.error("Số lượng mỗi dòng phải là số nguyên lớn hơn 0"); return; }
      items.push({ plantTypeId: l.plantTypeId, stageCode: l.stageCode, quantity: q, notes: l.notes.trim() || undefined });
    }
    call("/api/garden-pack-requests", "POST", { orderId, gardenId, notes: notes.trim() || undefined, items }, () => {
      setOrderId(null); setNotes(""); setLines([{ key: Date.now(), plantTypeId: null, stageCode: "S", quantity: "", notes: "" }]);
    });
  };

  const shown = requests.filter((r) => r.status === tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><PackageOpen className="w-6 h-6 text-primary-strong" /> Phiếu giao vườn đóng gói</h1>
        <p className="text-text-secondary text-sm mt-1">Nhận đơn hàng từ NV bán hàng, xác nhận số lượng giao cho từng Vườn sản xuất đóng gói rồi gửi QLV. Vườn phân bổ từ Kho thành phẩm/Kho thanh lý, đóng gói và xác nhận xuất kho.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lập phiếu giao vườn</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Đơn hàng (đang giữ / đã xác nhận)</Label>
              <SearchSelect
                items={orders.map((o) => ({ value: o.id, label: `${o.code} · ${o.customer} · ${o.saleName}${o.status === "HELD" ? " · đang giữ" : ""}` }))}
                value={orderId}
                onChange={setOrderId}
                placeholder="Tìm mã đơn, khách hàng…"
              />
            </div>
            <div className="space-y-1">
              <Label>Vườn sản xuất đóng gói</Label>
              <Select items={gardens.map((g) => ({ value: g.id, label: g.label }))} value={gardenId} onValueChange={(v) => setGardenId(v as string)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn vườn" /></SelectTrigger>
                <SelectContent>{gardens.map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {order && (
            <div className="rounded-lg bg-primary-light/40 p-3 text-sm space-y-1">
              <p><span className="font-mono">{order.code}</span> · KH {order.customer} · NV bán hàng {order.saleName}{order.expectedShipAt ? ` · dự kiến xuất ${format(new Date(order.expectedShipAt), "HH:mm dd/MM/yyyy")}` : ""}</p>
              {order.items.length > 0 && <p className="text-text-secondary">Dòng đơn (Kho thành phẩm): {order.items.join(" · ")}</p>}
              {order.notes && <p className="text-text-secondary">Ghi chú đơn: {order.notes}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label>Cây giao vườn đóng gói</Label>
            {lines.map((l) => (
              <div key={l.key} className="grid gap-2 md:grid-cols-[minmax(0,2fr)_110px_120px_minmax(0,2fr)_40px] items-start">
                <SearchSelect items={plantItems} value={l.plantTypeId} onChange={(v) => setLine(l.key, { plantTypeId: v })} placeholder="Mã cây" />
                <Select items={sizes.map((s) => ({ value: s, label: `Size ${s}` }))} value={l.stageCode} onValueChange={(v) => setLine(l.key, { stageCode: v as string })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{sizes.map((s) => <SelectItem key={s} value={s}>Size {s}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={1} placeholder="Số lượng" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                <Input placeholder="Ghi chú đóng gói (nếu có)" value={l.notes} maxLength={500} onChange={(e) => setLine(l.key, { notes: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Xoá dòng">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: Date.now(), plantTypeId: null, stageCode: "S", quantity: "", notes: "" }])}>
              <Plus className="w-4 h-4 mr-1" /> Thêm dòng
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Ghi chú cho vườn</Label>
            <Input value={notes} maxLength={2000} placeholder="VD: đóng thùng carton, giao trước 10h…" onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Gửi QLV</Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(["SENT", "DONE", "CANCELLED"] as Req["status"][]).map((s) => (
          <Button key={s} size="sm" variant={tab === s ? "default" : "outline"} onClick={() => setTab(s)}>{STATUS[s].label} · {requests.filter((r) => r.status === s).length}</Button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">Không có phiếu nào</CardContent></Card>
      ) : shown.map((r) => (
        <Card key={r.id}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><span className="font-mono">{r.code}</span> <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge></CardTitle>
              <p className="text-sm text-text-secondary mt-1">
                Đơn <span className="font-mono">{r.orderCode}</span> · KH {r.customer} · NV bán hàng {r.saleName} → <strong>{r.gardenName}</strong>
                {r.packerName ? ` · NV đóng gói ${r.packerName}` : ""}
              </p>
              <p className="text-xs text-text-muted">Lập bởi {r.createdByName} · {format(new Date(r.createdAt), "HH:mm dd/MM/yyyy")}
                {r.doneAt ? ` · xuất đủ ${format(new Date(r.doneAt), "HH:mm dd/MM/yyyy")}` : ""}
                {r.cancelledAt ? ` · huỷ ${format(new Date(r.cancelledAt), "HH:mm dd/MM/yyyy")}${r.cancelReason ? ` (${r.cancelReason})` : ""}` : ""}
              </p>
              {r.notes && <p className="text-sm text-text-secondary">Ghi chú: {r.notes}</p>}
            </div>
            {r.status === "SENT" && (
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-danger-light" disabled={busy} onClick={() => setCancel({ req: r, reason: "" })}>
                <XCircle className="w-4 h-4 mr-1" /> Huỷ phiếu
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    {["Mã cây", "Size", "Ghi chú đóng gói"].map((h) => <th key={h} className="text-left px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                    {["Cần đóng gói", "Đã phân bổ", "Đã đóng gói", "Đã xuất"].map((h) => <th key={h} className="text-right px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((it) => (
                    <tr key={it.id} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                      <td className="px-3 py-2"><span className="font-mono text-text-secondary mr-1">{it.plantCode}</span>{it.plantName}</td>
                      <td className="px-3 py-2">{it.stageCode}</td>
                      <td className="px-3 py-2 text-xs text-text-secondary">{it.notes ?? ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(it.quantity)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(it.allocated)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(it.packed)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(it.shipped)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!cancel} onOpenChange={(o) => { if (!o && !busy) setCancel(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Huỷ phiếu {cancel?.req.code}</DialogTitle></DialogHeader>
          {cancel && (
            <div className="space-y-2 text-sm">
              <p className="text-text-secondary">Phần đã phân bổ chưa xuất sẽ được giải phóng về kho nguồn của vườn; phần đã xuất giữ nguyên. QLV {cancel.req.gardenName} nhận thông báo dừng đóng gói.</p>
              <Label>Lý do</Label>
              <Input value={cancel.reason} maxLength={500} onChange={(e) => setCancel({ ...cancel, reason: e.target.value })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setCancel(null)}>Đóng</Button>
            <Button variant="destructive" disabled={busy} onClick={() => cancel && call(`/api/garden-pack-requests/${cancel.req.id}`, "PATCH", { action: "cancel", reason: cancel.reason.trim() || undefined }, () => setCancel(null))}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Huỷ phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
