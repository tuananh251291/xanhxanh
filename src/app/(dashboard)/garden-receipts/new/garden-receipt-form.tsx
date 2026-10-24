"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxInputGroup, ComboboxItem, ComboboxList, ComboboxTrigger,
} from "@/components/ui/combobox";
import { ArrowLeft, Plus, Trash2, Loader2, TriangleAlert, Send } from "lucide-react";
import { toast } from "sonner";
import {
  GARDEN_ORDER_TYPE_LABELS, GARDEN_OUTPUT_SPEC_LABELS, GARDEN_OUTPUT_SPECS, CONTAMINATED_OUTPUT_SPEC, type GardenOutputSpec,
} from "@/lib/garden-receipt-constants";

type StockOption = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number };
export type SourceOption = { roomId: string | null; label: string; stock: StockOption[] };
type Garden = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };
type OutputRow = { key: number; stageCode: GardenOutputSpec | ""; quantity: string };
type Row = { key: number; comboKey: string; quantity: string; outputs: OutputRow[] };
type OrderType = keyof typeof GARDEN_ORDER_TYPE_LABELS;
type Sale = { id: string; code: string; name: string };
const OUTPUT_OPTIONS = GARDEN_OUTPUT_SPECS.map((c) => ({ value: c, label: GARDEN_OUTPUT_SPEC_LABELS[c] }));

const fmt = (n: number) => n.toLocaleString("vi-VN");
const keyOf = (s: { plantTypeId: string; stageCode: string }) => `${s.plantTypeId}:${s.stageCode}`;
const emptyRow = (key: number): Row => ({ key, comboKey: "", quantity: "", outputs: [{ key: 0, stageCode: "", quantity: "" }] });
const outputTotal = (r: Row) => r.outputs.reduce((s, o) => s + (Number(o.quantity) || 0), 0);

// Form lập phiếu bàn giao cây mô về vườn — nhiều dòng mã cây + quy cách, số "còn giao được" đã trừ phần đang
// giữ (đơn hàng/Phiếu xử lý ở Kho TP, phiếu bàn giao chờ nhận ở Phòng ra rễ). Tồn bên giao trừ ngay khi lập.
export default function GardenReceiptForm({ warehouseName, gardens, sources, sales }: { warehouseName: string; gardens: Garden[]; sources: SourceOption[]; sales: Sale[] }) {
  const router = useRouter();
  const rowKeyRef = useRef(1);
  const [gardenId, setGardenId] = useState<string | null>(gardens.length === 1 ? gardens[0].id : null);
  const [sourceIdx, setSourceIdx] = useState(0);
  const [rows, setRows] = useState<Row[]>([emptyRow(0)]);
  const [notes, setNotes] = useState("");
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [saleUserId, setSaleUserId] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const source = sources[sourceIdx];
  const stockByKey = useMemo(() => new Map((source?.stock ?? []).map((s) => [keyOf(s), s])), [source]);
  const comboOptions: ComboOption[] = useMemo(
    () => (source?.stock ?? []).map((s) => ({ value: keyOf(s), label: `${s.plantTypeCode} ${s.plantTypeName} — ${s.stageCode} (${fmt(s.quantity)} cây)` })),
    [source]
  );

  const updateRow = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateOutput = (rowKey: number, outKey: number, patch: Partial<OutputRow>) =>
    setRows((prev) => prev.map((r) => (r.key !== rowKey ? r : { ...r, outputs: r.outputs.map((o) => (o.key === outKey ? { ...o, ...patch } : o)) })));
  const addOutput = (rowKey: number) =>
    setRows((prev) => prev.map((r) => (r.key !== rowKey ? r : { ...r, outputs: [...r.outputs, { key: rowKeyRef.current++, stageCode: "", quantity: "" }] })));
  const removeOutput = (rowKey: number, outKey: number) =>
    setRows((prev) => prev.map((r) => (r.key !== rowKey || r.outputs.length <= 1 ? r : { ...r, outputs: r.outputs.filter((o) => o.key !== outKey) })));
  const filledRows = rows.filter((r) => r.comboKey || r.quantity);
  const totalQty = filledRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  const validate = () => {
    if (!gardenId) { toast.error("Chưa chọn vườn nhận"); return false; }
    if (!orderType) { toast.error("Chưa chọn loại lệnh sản xuất"); return false; }
    if (orderType === "PLANNED") {
      if (!saleUserId) { toast.error("Chưa chọn NV bán hàng đặt hàng"); return false; }
      if (!deliveryDate) { toast.error("Chưa chọn ngày giao dự kiến"); return false; }
    }
    if (filledRows.length === 0) { toast.error("Chưa nhập dòng nào"); return false; }
    const used = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.comboKey && !row.quantity) continue;
      if (!stockByKey.has(row.comboKey)) { toast.error(`Dòng ${i + 1}: chọn mã cây + quy cách`); return false; }
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) { toast.error(`Dòng ${i + 1}: nhập số lượng bàn giao`); return false; }
      used.set(row.comboKey, (used.get(row.comboKey) ?? 0) + qty);
      if (orderType === "PLANNED") {
        if (row.outputs.some((o) => !o.stageCode || !(Number(o.quantity) > 0))) { toast.error(`Dòng ${i + 1}: chọn quy cách đầu ra và nhập số lượng`); return false; }
        if (new Set(row.outputs.map((o) => o.stageCode)).size !== row.outputs.length) { toast.error(`Dòng ${i + 1}: quy cách đầu ra bị trùng`); return false; }
        if (outputTotal(row) !== qty) { toast.error(`Dòng ${i + 1}: tổng đầu ra ${fmt(outputTotal(row))} phải bằng số bàn giao ${fmt(qty)}`); return false; }
      }
    }
    for (const [k, qty] of used) {
      const s = stockByKey.get(k)!;
      if (qty > s.quantity) { toast.error(`${s.plantTypeCode} ${s.stageCode}: vượt số còn giao được (${fmt(s.quantity)} cây)`); return false; }
    }
    return true;
  };

  const send = async () => {
    setSubmitting(true);
    try {
      const lines = filledRows.map((r) => {
        const s = stockByKey.get(r.comboKey)!;
        return {
          plantTypeId: s.plantTypeId, stageCode: s.stageCode, quantity: Number(r.quantity) || 0,
          outputs: orderType === "PLANNED" ? r.outputs.map((o) => ({ stageCode: o.stageCode, quantity: Number(o.quantity) })) : undefined,
        };
      });
      const res = await fetch("/api/garden-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gardenId, roomId: source.roomId ?? undefined, lines, notes: notes.trim() || undefined,
          orderType, saleUserId: orderType === "PLANNED" ? saleUserId : undefined,
          expectedDeliveryDate: orderType === "PLANNED" ? deliveryDate : undefined,
          orderNotes: orderNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Lập phiếu thất bại"); return; }
      toast.success(`Đã lập phiếu ${json.code} — chờ vườn kiểm đếm`);
      router.push(`/garden-receipts/${json.id}`);
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  const gardenName = gardens.find((g) => g.id === gardenId)?.name;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/garden-receipts"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lập phiếu bàn giao cây về vườn</h1>
          <p className="text-text-secondary text-sm">Bên giao: {warehouseName} — tồn trừ ngay khi lập phiếu</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Vườn nhận</Label>
            <Select items={gardens.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))} value={gardenId} onValueChange={(v) => setGardenId(v as string)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn vườn sản xuất" /></SelectTrigger>
              <SelectContent>
                {gardens.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Lấy cây từ</Label>
            {sources.length > 1 ? (
              <Select
                items={sources.map((s, i) => ({ value: String(i), label: s.label }))}
                value={String(sourceIdx)}
                onValueChange={(v) => { setSourceIdx(Number(v)); setRows([emptyRow(rowKeyRef.current++)]); }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sources.map((s, i) => <SelectItem key={i} value={String(i)}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-foreground h-9 flex items-center">{source?.label ?? "—"}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lệnh sản xuất</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GARDEN_ORDER_TYPE_LABELS) as OrderType[]).map((t) => (
              <Button key={t} type="button" size="sm" variant={orderType === t ? "default" : "outline"} onClick={() => setOrderType(t)}>
                {GARDEN_ORDER_TYPE_LABELS[t]}
              </Button>
            ))}
          </div>
          {orderType === "CONTAMINATED" && (
            <p className="text-sm text-info-foreground bg-info-light rounded-lg p-3">
              Đầu ra mặc định: <strong>{GARDEN_OUTPUT_SPEC_LABELS[CONTAMINATED_OUTPUT_SPEC]}</strong> cho toàn bộ số cây bàn giao.
            </p>
          )}
          {orderType === "PLANNED" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>NV bán hàng đặt hàng</Label>
                <Select items={sales.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))} value={saleUserId} onValueChange={(v) => setSaleUserId(v as string)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Chọn NV bán hàng" /></SelectTrigger>
                  <SelectContent>
                    {sales.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ngày giao dự kiến</Label>
                <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>
              <p className="text-xs text-text-secondary sm:col-span-2">Mỗi dòng cây bên dưới chọn 1 hoặc nhiều quy cách đầu ra — tổng đầu ra phải bằng số bàn giao của dòng.</p>
            </div>
          )}
          {orderType && (
            <div className="space-y-1">
              <Label>Ghi chú lệnh sản xuất <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
              <Input value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} maxLength={500} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Danh sách cây bàn giao</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!source || source.stock.length === 0 ? (
            <p className="text-sm text-text-muted py-2">{source?.label ?? "Nguồn"} không còn cây nào giao được.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[640px] space-y-2">
                  <div className="grid grid-cols-[2fr_9rem_9rem_2.5rem] gap-2 text-sm text-primary-strong font-bold px-1">
                    <span>Mã cây + quy cách</span><span>Còn giao được</span><span>Số lượng bàn giao</span><span />
                  </div>
                  {rows.map((row) => {
                    const s = stockByKey.get(row.comboKey);
                    const outTotal = outputTotal(row);
                    const qty = Number(row.quantity) || 0;
                    return (
                      <div key={row.key} className="border border-divider rounded-lg p-2 space-y-2">
                      <div className="grid grid-cols-[2fr_9rem_9rem_2.5rem] gap-2 items-center">
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
                          type="number" min={1} max={s?.quantity} className="h-9 text-xs" placeholder={s ? "Số cây" : "—"}
                          value={row.quantity} disabled={!s}
                          onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                        />
                        <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-danger-light" title="Xoá dòng"
                          disabled={rows.length <= 1} onClick={() => setRows((p) => p.filter((r) => r.key !== row.key))}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {orderType === "PLANNED" && (
                        <div className="pl-3 border-l-2 border-primary-light space-y-1.5">
                          <p className="text-xs font-medium text-text-secondary">
                            Quy cách đầu ra — <span className={outTotal === qty && qty > 0 ? "text-success-foreground" : "text-destructive"}>tổng {fmt(outTotal)}/{fmt(qty)} cây</span>
                          </p>
                          {row.outputs.map((o) => (
                            <div key={o.key} className="flex items-center gap-2">
                              <Select items={OUTPUT_OPTIONS} value={o.stageCode || null} onValueChange={(v) => updateOutput(row.key, o.key, { stageCode: (v as GardenOutputSpec) ?? "" })}>
                                <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Chọn quy cách" /></SelectTrigger>
                                <SelectContent>
                                  {OUTPUT_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input type="number" min={1} className="h-8 w-28 text-xs" placeholder="Số lượng" value={o.quantity}
                                onChange={(e) => updateOutput(row.key, o.key, { quantity: e.target.value })} />
                              <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-danger-light" title="Xoá quy cách"
                                disabled={row.outputs.length <= 1} onClick={() => removeOutput(row.key, o.key)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addOutput(row.key)}>
                            <Plus className="w-3 h-3 mr-1" /> Thêm quy cách đầu ra
                          </Button>
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setRows((p) => [...p, emptyRow(rowKeyRef.current++)])} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Thêm dòng
              </Button>
              <div className="space-y-1">
                <Label>Ghi chú <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
              </div>
              <Button className="w-full" disabled={submitting} onClick={() => { if (validate()) setConfirmOpen(true); }}>
                <Send className="w-4 h-4 mr-2" /> Lập phiếu bàn giao
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!submitting) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Xác nhận lập phiếu</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground">{source?.label} → {gardenName}: {filledRows.length} dòng, tổng {fmt(totalQty)} cây</p>
          <p className="text-sm text-foreground">{orderType ? GARDEN_ORDER_TYPE_LABELS[orderType] : ""}{orderType === "PLANNED" ? ` · ${sales.find((u) => u.id === saleUserId)?.name ?? ""} · giao dự kiến ${deliveryDate}` : ""}</p>
          <div className="flex items-start gap-2 text-sm font-medium text-warning-foreground bg-warning-light rounded-lg p-3">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            Kiểm tra lại: đây là số cây, không phải số túi. Tồn kho bên giao trừ ngay khi lập phiếu.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>Kiểm tra lại</Button>
            <Button onClick={send} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
