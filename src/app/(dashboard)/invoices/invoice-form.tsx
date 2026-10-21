"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxInputGroup, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import InvoiceSheet, { type InvoiceSheetProfile } from "@/components/shared/invoice-sheet";
import {
  AU_STATES, SHIP_CATS, US_STATES, autoShipCat, euSettingsFor, blankInvoiceInput, computeInvoice, fmtMoney, isTcProduct, priceKey,
  type InvoiceContext, type InvoiceInput, type InvoiceLine, type ShipCat,
} from "@/lib/invoice-engine";

type Opt = { value: string; label: string };
export type InvoiceFormMarket = { id: string; code: string; name: string; currency: string; derivedCurrency: string | null };
export type InvoiceFormCustomer = { id: string; code: string; name: string; marketId: string; email: string | null };
export type InvoiceFormOrder = { id: string; code: string; customerId: string | null; customerCode: string; plants: number };
export type InvoiceFormProfile = InvoiceSheetProfile & { id: string };
export type InvoiceFormInitial = {
  id: string; invoiceNo: string; invoiceDate: string; marketId: string; customerId: string | null; customerName: string;
  customerAddress: string | null; customerEmail: string | null; orderId: string | null; companyProfileId: string | null; note: string | null; input: InvoiceInput;
};

const toNum = (v: string): number | null => { const t = v.trim().replace(/,/g, ""); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const US_STATE_LABEL = (s: string) => (s === "OTHER" ? "Khác (AK, HI, DC…)" : s);

function Pick({ items, value, onChange, placeholder, empty }: { items: Opt[]; value: string; onChange: (v: string) => void; placeholder: string; empty: string }) {
  return (
    <Combobox items={items} value={items.find((o) => o.value === value) ?? null} isItemEqualToValue={(a: Opt, b: Opt) => a.value === b.value} onValueChange={(v: Opt | null) => onChange(v?.value ?? "")}>
      <ComboboxInputGroup>
        <ComboboxInput placeholder={placeholder} />
        <ComboboxTrigger />
      </ComboboxInputGroup>
      <ComboboxContent>
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList>{(item: Opt) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function NumInput({ value, onChange, placeholder, className }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { if (toNum(text) !== value) setText(value == null ? "" : String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Input inputMode="decimal" className={className ?? "h-8"} value={text} placeholder={placeholder} onChange={(e) => { setText(e.target.value); onChange(toNum(e.target.value)); }} />;
}

export default function InvoiceForm({
  markets, customers, orders, profiles, today, initial, presetOrderId,
}: {
  markets: InvoiceFormMarket[]; customers: InvoiceFormCustomer[]; orders: InvoiceFormOrder[]; profiles: InvoiceFormProfile[];
  today: string; initial: InvoiceFormInitial | null; presetOrderId: string | null;
}) {
  const router = useRouter();
  const presetOrder = presetOrderId ? orders.find((o) => o.id === presetOrderId) ?? null : null;
  const presetCustomer = presetOrder?.customerId ? customers.find((c) => c.id === presetOrder.customerId) ?? null : null;

  const [invoiceDate, setInvoiceDate] = useState(initial?.invoiceDate ?? today);
  const [customerId, setCustomerId] = useState(initial?.customerId ?? presetCustomer?.id ?? "");
  const [marketId, setMarketId] = useState(initial?.marketId ?? presetCustomer?.marketId ?? "");
  const [customerName, setCustomerName] = useState(initial?.customerName ?? presetCustomer?.name ?? "");
  const [customerAddress, setCustomerAddress] = useState(initial?.customerAddress ?? "");
  const [customerEmail, setCustomerEmail] = useState(initial?.customerEmail ?? presetCustomer?.email ?? "");
  const [orderId, setOrderId] = useState(initial?.orderId ?? presetOrder?.id ?? "");
  const [profileId, setProfileId] = useState(initial?.companyProfileId ?? profiles[0]?.id ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [input, setInput] = useState<InvoiceInput>(() => initial?.input ?? blankInvoiceInput(markets.find((m) => m.id === marketId)?.currency ?? "USD"));
  const [ctx, setCtx] = useState<InvoiceContext | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [view, setView] = useState<"customer" | "internal">("customer");
  const [saving, setSaving] = useState(false);
  const [serverBlockers, setServerBlockers] = useState<string[]>([]);

  const market = markets.find((m) => m.id === marketId) ?? null;
  useEffect(() => { setServerBlockers([]); }, [input, marketId, invoiceDate]);
  const kind = ctx?.market.invoiceCalcKind ?? "SIMPLE";

  useEffect(() => {
    if (!marketId || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) { setCtx(null); return; }
    let alive = true;
    setLoadingCtx(true);
    fetch(`/api/invoices/context?marketId=${marketId}&date=${invoiceDate}`)
      .then(async (r) => { const j = await r.json(); if (!alive) return; if (!r.ok) { toast.error(j.message ?? "Không tải được bảng giá"); setCtx(null); } else setCtx(j); })
      .finally(() => alive && setLoadingCtx(false));
    return () => { alive = false; };
  }, [marketId, invoiceDate]);

  // Đổi thị trường: về đơn vị tiền gốc, giữ dòng nhập tay.
  const changeMarket = (id: string) => {
    if (id === marketId) return;
    const m = markets.find((x) => x.id === id);
    setMarketId(id);
    setInput((v) => ({ ...blankInvoiceInput(m?.currency ?? "USD"), manual: v.manual, lines: [] }));
  };
  const onCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) { setCustomerName(c.name); setCustomerEmail(c.email ?? ""); changeMarket(c.marketId); }
    if (orderId && orders.find((o) => o.id === orderId)?.customerId !== id) setOrderId("");
  };
  const onOrder = (id: string) => {
    setOrderId(id);
    const o = orders.find((x) => x.id === id);
    if (o?.customerId && o.customerId !== customerId) onCustomer(o.customerId);
  };

  const products = useMemo(() => ctx?.priceList?.items ?? [], [ctx]);
  const productOpts: Opt[] = useMemo(() => products.map((p) => ({ value: priceKey(p), label: `${p.code} — ${p.name}${kind === "SEA" || kind === "SG" ? ` — ${p.spec}` : ""}` })), [products, kind]);
  const byKey = useMemo(() => new Map(products.map((p) => [priceKey(p), p])), [products]);

  const result = useMemo(() => (ctx ? computeInvoice(ctx, input) : null), [ctx, input]);
  const setLine = (i: number, patch: Partial<InvoiceLine>) => setInput((v) => ({ ...v, lines: v.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));
  const set = <K extends keyof InvoiceInput>(k: K, patch: Partial<InvoiceInput[K]>) => setInput((v) => ({ ...v, [k]: { ...(v[k] as object), ...patch } }));

  const save = async () => {
    if (!marketId) { toast.error("Chọn khách hàng hoặc thị trường"); return; }
    setSaving(true); setServerBlockers([]);
    try {
      const data = {
        marketId, invoiceDate, customerId: customerId || null, customerName: customerName.trim(),
        customerAddress: customerAddress.trim() || null, customerEmail: customerEmail.trim() || null,
        orderId: orderId || null, companyProfileId: profileId, note: note.trim() || null, input,
      };
      const res = initial
        ? await fetch(`/api/invoices/${initial.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", data }) })
        : await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.message ?? "Có lỗi xảy ra"); if (j.blockers) setServerBlockers(j.blockers); return; }
      toast.success(j.status === "PENDING_APPROVAL" ? `Đã lưu ${j.invoiceNo} — chờ Admin cấp cao duyệt giá nhập tay` : `Đã lưu ${j.invoiceNo}`);
      router.push(`/invoices/${j.id}`);
      router.refresh();
    } finally { setSaving(false); }
  };

  const customerOpts: Opt[] = customers.map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` }));
  const orderOpts: Opt[] = orders.filter((o) => !customerId || !o.customerId || o.customerId === customerId)
    .map((o) => ({ value: o.id, label: `${o.code} · ${o.customerCode} · ${o.plants.toLocaleString("vi-VN")} cây` }));
  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const settings = ctx?.settings;
  const extraFees = (settings?.extraFees[ctx?.market.code ?? ""] ?? []).filter((f) => f.enabled);
  const blockers = [...(result?.blockers ?? []), ...serverBlockers.filter((b) => !result?.blockers.includes(b))];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Thông tin chung</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Khách hàng (bỏ trống nếu báo giá cho khách chưa có trong hệ thống)</Label>
              <Pick items={customerOpts} value={customerId} onChange={onCustomer} placeholder="Gõ mã hoặc tên khách hàng…" empty="Không tìm thấy khách bạn phụ trách" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tên khách trên phiếu báo giá *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Địa chỉ giao hàng</Label>
              <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Thành phố, bang…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Thị trường {customerId && <span className="text-text-muted">(theo khách hàng)</span>}</Label>
              <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={marketId} disabled={!!customerId} onChange={(e) => changeMarket(e.target.value)}>
                <option value="">— Chọn —</option>
                {markets.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Đơn vị tiền</Label>
              <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={input.currency} disabled={!market?.derivedCurrency}
                onChange={(e) => setInput((v) => ({ ...v, currency: e.target.value }))}>
                {market && <option value={market.currency}>{market.currency}</option>}
                {market?.derivedCurrency && <option value={market.derivedCurrency}>{market.derivedCurrency} (đổi theo tỉ giá tháng)</option>}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ngày báo giá</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Thông tin công ty *</Label>
              <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                {profiles.length === 0 && <option value="">Chưa có mẫu — nhờ Admin cấp cao tạo</option>}
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Gắn đơn hàng đang giữ (bỏ trống = báo giá độc lập)</Label>
              <Pick items={orderOpts} value={orderId} onChange={onOrder} placeholder="Gõ mã đơn…" empty="Không có đơn đang giữ" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Sản phẩm</CardTitle>
              <span className="text-xs text-text-muted">
                {loadingCtx ? "Đang tải bảng giá…" : ctx?.priceList ? `Bảng giá tháng ${ctx.priceList.month} · ${ctx.priceList.items.length} dòng` : marketId ? "Chưa có bảng giá đã duyệt" : ""}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {input.lines.map((l, i) => {
              const p = byKey.get(l.key);
              const tc = p ? isTcProduct(kind, p) : true;
              const cat = p ? (l.shipCat || autoShipCat(p, l.bag)) : "";
              const pills = result?.linePills[i] ?? [];
              return (
                <div key={i} className="rounded-lg border border-divider p-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <Pick items={productOpts} value={l.key} onChange={(v) => setLine(i, { key: v, shipCat: "" })} placeholder="Gõ mã hoặc tên cây, VD AL062" empty="Không có trong bảng giá" />
                    </div>
                    <Button variant="outline" size="sm" className="h-9" onClick={() => setInput((v) => ({ ...v, lines: v.lines.filter((_, k) => k !== i) }))}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="space-y-1"><span className="text-xs text-text-secondary block">Số cây</span><NumInput className="h-8 w-24" value={l.qty} onChange={(v) => setLine(i, { qty: v ?? 0 })} /></label>
                    {tc && (
                      <label className="space-y-1"><span className="text-xs text-text-secondary block">Túi</span>
                        <select className="h-8 rounded-md border border-border bg-background px-2 text-sm" value={l.bag} onChange={(e) => setLine(i, { bag: Number(e.target.value), shipCat: "" })}>
                          {[1, 5, 10].map((b) => <option key={b} value={b}>Túi {b}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="space-y-1"><span className="text-xs text-text-secondary block">Giá tay/cây (cần duyệt)</span><NumInput className="h-8 w-32" value={l.manualPrice} placeholder="theo bảng giá" onChange={(v) => setLine(i, { manualPrice: v })} /></label>
                    {kind === "SEA" && (
                      <>
                        <label className="space-y-1"><span className="text-xs text-text-secondary block">Nhóm ship</span>
                          <select className="h-8 rounded-md border border-border bg-background px-2 text-sm" value={cat} onChange={(e) => setLine(i, { shipCat: e.target.value as ShipCat })}>
                            {SHIP_CATS.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}
                          </select>
                        </label>
                        <label className="space-y-1"><span className="text-xs text-text-secondary block">Ship tay/cây</span><NumInput className="h-8 w-24" value={l.shipRate} placeholder="theo bảng" onChange={(v) => setLine(i, { shipRate: v })} /></label>
                      </>
                    )}
                  </div>
                  {pills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pills.map((pl, k) => (
                        <Badge key={k} variant={pl.tone === "bad" ? "overdue" : pl.tone === "warn" ? "in-progress" : pl.tone === "ok" ? "completed" : "outline"}>{pl.text}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!ctx?.priceList} onClick={() => setInput((v) => ({ ...v, lines: [...v.lines, { key: "", qty: 10, bag: 10, manualPrice: null, shipCat: "", shipRate: null }] }))}>
                <Plus className="w-4 h-4 mr-1" /> Thêm cây
              </Button>
              {kind !== "AU" && (
                <Button size="sm" variant="outline" disabled={!ctx} onClick={() => setInput((v) => ({ ...v, manual: [...v.manual, { code: "", desc: "", spec: "", qty: 1, unit: 0, shipRate: null }], us: { ...v.us, boxMode: "manual" } }))}>
                  <Plus className="w-4 h-4 mr-1" /> Dòng nhập tay (cây rễ/cành — cần duyệt)
                </Button>
              )}
            </div>
            {input.manual.map((m, i) => {
              const setM = (patch: Partial<typeof m>) => setInput((v) => ({ ...v, manual: v.manual.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
              return (
                <div key={`m${i}`} className="rounded-lg border border-dashed border-border p-3 flex flex-wrap gap-3 items-end">
                  <label className="space-y-1 flex-1 min-w-48"><span className="text-xs text-text-secondary block">Mô tả (tên cây, cỡ)</span><Input className="h-8" value={m.desc} onChange={(e) => setM({ desc: e.target.value })} /></label>
                  <label className="space-y-1"><span className="text-xs text-text-secondary block">Mã</span><Input className="h-8 w-24" value={m.code} onChange={(e) => setM({ code: e.target.value })} /></label>
                  <label className="space-y-1"><span className="text-xs text-text-secondary block">Quy cách</span><Input className="h-8 w-32" value={m.spec} placeholder="Rooted / cutting" onChange={(e) => setM({ spec: e.target.value })} /></label>
                  <label className="space-y-1"><span className="text-xs text-text-secondary block">Số cây</span><NumInput className="h-8 w-20" value={m.qty} onChange={(v) => setM({ qty: v ?? 0 })} /></label>
                  <label className="space-y-1"><span className="text-xs text-text-secondary block">Đơn giá</span><NumInput className="h-8 w-24" value={m.unit} onChange={(v) => setM({ unit: v ?? 0 })} /></label>
                  {kind === "SEA" && <label className="space-y-1"><span className="text-xs text-text-secondary block">Ship/cây</span><NumInput className="h-8 w-20" value={m.shipRate} onChange={(v) => setM({ shipRate: v })} /></label>}
                  <Button variant="outline" size="sm" className="h-8" onClick={() => setInput((v) => ({ ...v, manual: v.manual.filter((_, k) => k !== i) }))}><Trash2 className="w-4 h-4" /></Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {ctx && settings && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Vận chuyển & thuế phí — {ctx.market.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {kind === "US" && (
                <>
                  <div className="flex flex-wrap gap-3">
                    <label className="space-y-1"><span className="text-xs text-text-secondary block">Chuyến hàng</span>
                      <select className="h-9 rounded-md border border-border bg-background px-2" value={input.us.shipmentDate} onChange={(e) => set("us", { shipmentDate: e.target.value })}>
                        <option value="">— Chọn chuyến —</option>
                        {settings.us.shipments.map((s) => <option key={s.date} value={s.date}>{s.date} — mức {s.kg}kg</option>)}
                      </select>
                    </label>
                    <label className="space-y-1"><span className="text-xs text-text-secondary block">Bang của khách</span>
                      <select className="h-9 rounded-md border border-border bg-background px-2" value={input.us.state} onChange={(e) => set("us", { state: e.target.value })}>
                        {US_STATES.map((s) => <option key={s} value={s}>{US_STATE_LABEL(s)}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2"><Checkbox checked={input.us.resale} onCheckedChange={(c) => set("us", { resale: !!c })} /> Khách có resale certificate</label>
                    <label className="flex items-center gap-2"><Checkbox checked={input.us.ups} onCheckedChange={(c) => set("us", { ups: !!c })} /> Ship UPS Next Day Air Saver</label>
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <span className="text-xs text-text-secondary">Đóng thùng:</span>
                    <label className="flex items-center gap-1.5"><input type="radio" checked={input.us.boxMode === "auto"} onChange={() => set("us", { boxMode: "auto" })} /> Tự động (chỉ cây mô)</label>
                    <label className="flex items-center gap-1.5"><input type="radio" checked={input.us.boxMode === "manual"} onChange={() => set("us", { boxMode: "manual" })} /> Chọn tay (cây rễ/hỗn hợp)</label>
                  </div>
                  {input.us.boxMode === "manual" && (
                    <div className="space-y-2">
                      {input.us.boxes.map((b, i) => (
                        <div key={i} className="flex gap-2">
                          <select className="h-8 flex-1 rounded-md border border-border bg-background px-2" value={b.boxId} onChange={(e) => set("us", { boxes: input.us.boxes.map((x, k) => (k === i ? { ...x, boxId: e.target.value } : x)) })}>
                            {settings.us.boxes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                          <NumInput className="h-8 w-20" value={b.count} onChange={(v) => set("us", { boxes: input.us.boxes.map((x, k) => (k === i ? { ...x, count: v ?? 0 } : x)) })} />
                          <Button variant="outline" size="sm" className="h-8" onClick={() => set("us", { boxes: input.us.boxes.filter((_, k) => k !== i) })}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => set("us", { boxes: [...input.us.boxes, { boxId: "r37", count: 1 }] })}><Plus className="w-4 h-4 mr-1" /> Thêm thùng</Button>
                    </div>
                  )}
                </>
              )}
              {kind === "EU" && (
                <>
                  <label className="flex items-center gap-2"><Checkbox checked={input.eu.nl} onCheckedChange={(c) => set("eu", { nl: !!c })} /> {ctx.market.code === "EU" ? "Giao tại Hà Lan (bỏ tick = nước EU khác: chỉ tính tiền hàng)" : "Tính phí vận chuyển (bỏ tick = chỉ tính tiền hàng)"}</label>
                  {input.eu.nl && (
                    <div className="flex flex-wrap gap-3">
                      <label className="space-y-1"><span className="text-xs text-text-secondary block">{ctx.market.code === "EU" ? "Phí DHL chặng cuối" : "Phí giao chặng cuối"} ({input.currency})</span><NumInput className="h-8 w-28" value={input.eu.lastMile} onChange={(v) => set("eu", { lastMile: v })} /></label>
                      <label className="space-y-1"><span className="text-xs text-text-secondary block">Số thùng TC (trống = tự động)</span><NumInput className="h-8 w-28" value={input.eu.tcBoxes} onChange={(v) => set("eu", { tcBoxes: v })} /></label>
                      <label className="space-y-1"><span className="text-xs text-text-secondary block">Thùng cành</span><NumInput className="h-8 w-20" value={input.eu.cutBoxes} onChange={(v) => set("eu", { cutBoxes: v ?? 0 })} /></label>
                      <label className="flex items-center gap-2 self-end pb-1"><Checkbox checked={input.eu.insurance} onCheckedChange={(c) => set("eu", { insurance: !!c })} /> Mua bảo hiểm vận chuyển ({euSettingsFor(settings, ctx.market.code).insurancePct}%)</label>
                    </div>
                  )}
                </>
              )}
              {kind === "AU" && (
                <>
                  <label className="space-y-1 block"><span className="text-xs text-text-secondary block">Bang của khách</span>
                    <select className="h-9 rounded-md border border-border bg-background px-2" value={input.au.state} onChange={(e) => set("au", { state: e.target.value })}>
                      {AU_STATES.map((s) => <option key={s} value={s}>{s}{s === "TAS" || s === "WA" ? " — không ship" : ""}</option>)}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-4 items-center">
                    <span className="text-xs text-text-secondary">Thùng:</span>
                    <label className="flex items-center gap-1.5"><input type="radio" checked={input.au.boxMode === "auto"} onChange={() => set("au", { boxMode: "auto" })} /> Tự động</label>
                    <label className="flex items-center gap-1.5"><input type="radio" checked={input.au.boxMode === "manual"} onChange={() => set("au", { boxMode: "manual" })} /> Chọn tay</label>
                  </div>
                  {input.au.boxMode === "manual" && (
                    <div className="space-y-2">
                      {input.au.boxes.map((b, i) => (
                        <div key={i} className="flex gap-2">
                          <select className="h-8 flex-1 rounded-md border border-border bg-background px-2" value={b.idx} onChange={(e) => set("au", { boxes: input.au.boxes.map((x, k) => (k === i ? { ...x, idx: Number(e.target.value) } : x)) })}>
                            {settings.au.boxes.map((x, j) => <option key={j} value={j}>{x.name}</option>)}
                          </select>
                          <NumInput className="h-8 w-20" value={b.count} onChange={(v) => set("au", { boxes: input.au.boxes.map((x, k) => (k === i ? { ...x, count: v ?? 0 } : x)) })} />
                          <Button variant="outline" size="sm" className="h-8" onClick={() => set("au", { boxes: input.au.boxes.filter((_, k) => k !== i) })}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => set("au", { boxes: [...input.au.boxes, { idx: 0, count: 1 }] })}><Plus className="w-4 h-4 mr-1" /> Thêm thùng</Button>
                    </div>
                  )}
                </>
              )}
              {(kind === "SEA" || kind === "SG") && (
                <div className="flex flex-wrap gap-4 items-end">
                  {kind === "SEA"
                    ? <label className="flex items-center gap-2"><Checkbox checked={input.sea.fullBox} onCheckedChange={(c) => set("sea", { fullBox: !!c })} /> Đơn đầy thùng 92×47×42 (giảm {settings.sea.fullBoxPct}% ship)</label>
                    : <label className="flex items-center gap-2"><Checkbox checked={input.sea.sgDoor} onCheckedChange={(c) => set("sea", { sgDoor: !!c })} /> Giao tận cửa (S${settings.sea.sgDoorFee}/điểm, khách trả trực tiếp)</label>}
                  <label className="space-y-1"><span className="text-xs text-text-secondary block">Mức ship tối thiểu riêng đơn này ({ctx.market.currency})</span>
                    <NumInput className="h-8 w-32" value={input.sea.minOverride} placeholder={String(settings.sea.minShip[ctx.market.code] ?? "không áp dụng")} onChange={(v) => set("sea", { minOverride: v })} />
                  </label>
                </div>
              )}
              {kind === "SIMPLE" && (
                <div className="flex flex-wrap gap-3">
                  <label className="space-y-1"><span className="text-xs text-text-secondary block">Tên dòng phí ship</span><Input className="h-8 w-48" value={input.simple.shippingLabel} onChange={(e) => set("simple", { shippingLabel: e.target.value })} /></label>
                  <label className="space-y-1"><span className="text-xs text-text-secondary block">Phí ship ({input.currency}, trống = không tính)</span><NumInput className="h-8 w-32" value={input.simple.shipping} onChange={(v) => set("simple", { shipping: v })} /></label>
                </div>
              )}
              {extraFees.filter((f) => f.optional).map((f) => (
                <label key={f.id} className="flex items-center gap-2">
                  <Checkbox checked={input.extraFeeIds.includes(f.id)} onCheckedChange={(c) => setInput((v) => ({ ...v, extraFeeIds: c ? [...v.extraFeeIds, f.id] : v.extraFeeIds.filter((x) => x !== f.id) }))} />
                  {f.label}
                </label>
              ))}
              {settings.paypalEnabled && (
                <label className="flex items-center gap-2"><Checkbox checked={input.paypal} onCheckedChange={(c) => setInput((v) => ({ ...v, paypal: !!c }))} /> Thanh toán PayPal (+{settings.paypalPct}% tổng phiếu báo giá)</label>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4 space-y-2">
            <Label className="text-xs">Ghi chú nội bộ</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 xl:sticky xl:top-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={view === "customer" ? "default" : "outline"} onClick={() => setView("customer")}>Bản gửi khách</Button>
          <Button size="sm" variant={view === "internal" ? "default" : "outline"} onClick={() => setView("internal")}>Bản nội bộ (chi tiết)</Button>
          {result && <span className="ml-auto text-sm font-bold">{fmtMoney(result.total, result.currency)}</span>}
        </div>
        {result ? (
          <InvoiceSheet
            invoiceNo={initial?.invoiceNo ?? "BG-(tự sinh khi lưu)"} date={invoiceDate} profile={profile}
            customer={{ name: customerName, address: customerAddress || null, email: customerEmail || null }}
            marketName={ctx?.market.name ?? ""} kind={kind} result={result} view={view} provisional={result.pending}
          />
        ) : (
          <Card><CardContent className="py-10 text-center text-text-muted">{loadingCtx ? "Đang tải…" : "Chọn khách hàng hoặc thị trường để bắt đầu"}</CardContent></Card>
        )}
        {blockers.length > 0 && (
          <div className="rounded-md bg-danger-light text-destructive text-sm px-4 py-2">
            <p className="font-bold">Cần xử lý trước khi lưu:</p>
            <ul className="list-disc pl-5">{blockers.map((b, k) => <li key={k}>{b}</li>)}</ul>
          </div>
        )}
        {result?.hasManualPrice && (
          <p className="rounded-md bg-warning-light text-warning-foreground text-sm px-4 py-2">Phiếu báo giá có giá nhập tay → sau khi lưu sẽ chờ Admin cấp cao duyệt mới in PDF / xác nhận đơn được.</p>
        )}
        <Button className="w-full" onClick={save} disabled={saving || !result || blockers.length > 0 || !customerName.trim() || !profileId}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {initial ? "Lưu thay đổi" : "Lưu phiếu báo giá"}
        </Button>
      </div>
    </div>
  );
}
