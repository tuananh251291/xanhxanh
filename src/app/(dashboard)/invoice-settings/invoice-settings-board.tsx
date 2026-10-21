"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SHIP_CATS, US_MILESTONES, type ExtraFee, type ExtraFeeKind, type InvoiceSettings } from "@/lib/invoice-engine";

type Market = { code: string; name: string; currency: string; derivedCurrency: string | null; invoiceCalcKind: string };
const FEE_KINDS: Record<ExtraFeeKind, string> = { PCT_GOODS: "% giá trị hàng", PCT_TOTAL: "% tổng (hàng + phí)", PER_PLANT: "Theo cây", FIXED: "Cố định / invoice" };

function Num({ value, onChange, className, disabled }: { value: number | null | undefined; onChange: (v: number | null) => void; className?: string; disabled?: boolean }) {
  const [t, setT] = useState(value == null ? "" : String(value));
  useEffect(() => { const n = t.trim() === "" ? null : Number(t); if (n !== (value ?? null)) setT(value == null ? "" : String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Input inputMode="decimal" disabled={disabled} className={className ?? "h-8 w-24"} value={t}
      onChange={(e) => { setT(e.target.value); const s = e.target.value.trim().replace(/,/g, ""); onChange(s === "" ? null : Number.isFinite(Number(s)) ? Number(s) : null); }} />
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1"><span className="text-xs text-text-secondary block">{label}</span>{children}</label>;
}
function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <label className="flex items-center gap-2 text-sm"><Checkbox checked={checked} disabled={disabled} onCheckedChange={(c) => onChange(!!c)} /> {label}</label>;
}
const th = "text-left px-2 py-1.5 text-sm text-primary-strong font-bold whitespace-nowrap";

export default function InvoiceSettingsBoard({ markets, canEdit }: { markets: Market[]; canEdit: boolean }) {
  const [s, setS] = useState<InvoiceSettings | null>(null);
  const [ships, setShips] = useState<{ date: string; kg: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch("/api/invoice-settings");
    const j = await res.json();
    if (!res.ok) { toast.error(j.message ?? "Có lỗi xảy ra"); return; }
    setS(j.settings); setShips(j.settings.us.shipments);
  };
  useEffect(() => { load(); }, []);

  // Sửa bất biến theo hàm cập nhật trên bản sao.
  const up = (fn: (d: InvoiceSettings) => void) => setS((cur) => { if (!cur) return cur; const d = structuredClone(cur); fn(d); return d; });
  const n0 = (v: number | null) => v ?? 0;

  const saveAll = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const res = await fetch("/api/invoice-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: s }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã lưu cài đặt invoice");
    } finally { setSaving(false); }
  };
  const saveShips = async () => {
    if (ships.some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x.date))) { toast.error("Nhập đủ ngày cho từng chuyến"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/invoice-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipments: ships }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã lưu lịch chuyến Mỹ");
      load();
    } finally { setSaving(false); }
  };

  if (!s) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  const seaMarkets = markets.filter((m) => m.invoiceCalcKind === "SEA" || m.invoiceCalcKind === "SG");
  const dis = !canEdit;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Lịch chuyến hàng Mỹ</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {ships.map((x, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-center">
              <Input type="date" className="h-8 w-44" value={x.date} onChange={(e) => setShips((a) => a.map((y, k) => (k === i ? { ...y, date: e.target.value } : y)))} />
              <select className="h-8 rounded-md border border-border bg-background px-2 text-sm" value={x.kg} onChange={(e) => setShips((a) => a.map((y, k) => (k === i ? { ...y, kg: Number(e.target.value) } : y)))}>
                {US_MILESTONES.map((kg) => <option key={kg} value={kg}>Mức {kg}kg</option>)}
              </select>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setShips((a) => a.filter((_, k) => k !== i))}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShips((a) => [...a, { date: "", kg: 100 }])}><Plus className="w-4 h-4 mr-1" /> Thêm chuyến</Button>
            <Button size="sm" onClick={saveShips} disabled={saving}><Save className="w-4 h-4 mr-1" /> Lưu lịch chuyến</Button>
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Chung</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-4 items-end">
                <Toggle checked={s.paypalEnabled} onChange={(v) => up((d) => { d.paypalEnabled = v; })} label="Cho phép phí PayPal" />
                <Field label="Phí PayPal (%)"><Num value={s.paypalPct} onChange={(v) => up((d) => { d.paypalPct = n0(v); })} /></Field>
                <Field label="Phụ thu túi 1 cây ĐNA (USD/túi)"><Num value={s.seaSurchargeUSD} onChange={(v) => up((d) => { d.seaSurchargeUSD = n0(v); })} /></Field>
              </div>
              <p className="text-xs text-text-secondary">Phụ thu túi 1 cây theo thị trường (đơn vị tiền invoice). Thị trường ĐNA bán bằng tiền địa phương: USD/túi ở trên × tỉ giá &quot;1 USD = ?&quot; của tháng.</p>
              <div className="flex flex-wrap gap-3">
                {markets.map((m) => (
                  <Field key={m.code} label={`${m.code} (${m.currency}${m.derivedCurrency ? "/" + m.derivedCurrency : ""})`}>
                    <Num value={s.surcharge[m.code] ?? null} onChange={(v) => up((d) => { if (v == null) delete d.surcharge[m.code]; else d.surcharge[m.code] = v; })} />
                  </Field>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Mỹ (US)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-4 items-end">
                <Toggle checked={s.us.tleEnabled} onChange={(v) => up((d) => { d.us.tleEnabled = v; })} label="Phí TLE" />
                <Field label="TLE (% hàng)"><Num value={s.us.tlePct} onChange={(v) => up((d) => { d.us.tlePct = n0(v); })} /></Field>
                <Toggle checked={s.us.dutyEnabled} onChange={(v) => up((d) => { d.us.dutyEnabled = v; })} label="Thuế nhập khẩu" />
                <Field label="Duty (% hàng)"><Num value={s.us.dutyPct} onChange={(v) => up((d) => { d.us.dutyPct = n0(v); })} /></Field>
                <Toggle checked={s.us.salesTaxEnabled} onChange={(v) => up((d) => { d.us.salesTaxEnabled = v; })} label="Sales tax (khách không có resale)" />
                <Field label="Sales tax (%)"><Num value={s.us.salesTaxPct} onChange={(v) => up((d) => { d.us.salesTaxPct = n0(v); })} /></Field>
                <Field label="UPS = FedEx ×"><Num value={s.us.upsMult} onChange={(v) => up((d) => { d.us.upsMult = n0(v); })} /></Field>
                <Field label="+ USD/thùng"><Num value={s.us.upsAdd} onChange={(v) => up((d) => { d.us.upsAdd = n0(v); })} /></Field>
              </div>
              <div className="overflow-x-auto border border-divider rounded-lg">
                <table className="text-sm">
                  <thead><tr className="bg-primary-light">
                    {["Thùng", "Loại", "Túi 1", "Túi 5", "Túi 10", "45kg", "100kg", "200kg", "300kg", "CA", "Tây", "Đông", "Ghi chú"].map((h) => <th key={h} className={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {s.us.boxes.map((b, i) => (
                      <tr key={b.id} className="border-b border-divider last:border-0">
                        <td className="px-2 py-1"><Input className="h-8 w-48" value={b.name} onChange={(e) => up((d) => { d.us.boxes[i].name = e.target.value; })} /></td>
                        <td className="px-2 py-1 text-xs">{b.kind}</td>
                        {(["cap1", "cap5", "cap10", "p45", "p100", "p200", "p300", "lmCA", "lmW", "lmE"] as const).map((k) => (
                          <td key={k} className="px-1 py-1"><Num className="h-8 w-20" value={b[k]} onChange={(v) => up((d) => { d.us.boxes[i][k] = n0(v); })} /></td>
                        ))}
                        <td className="px-2 py-1"><Input className="h-8 w-56" value={b.note} onChange={(e) => up((d) => { d.us.boxes[i].note = e.target.value; })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Châu Âu (EU — Fertiplant, AMS)</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-4 items-end">
              <Field label="Cước thùng TC (€)"><Num value={s.eu.boxTC} onChange={(v) => up((d) => { d.eu.boxTC = n0(v); })} /></Field>
              <Field label="TC từ 5 thùng"><Num value={s.eu.boxTC5} onChange={(v) => up((d) => { d.eu.boxTC5 = n0(v); })} /></Field>
              <Field label="Thùng cành (€)"><Num value={s.eu.boxCut} onChange={(v) => up((d) => { d.eu.boxCut = n0(v); })} /></Field>
              <Field label="Cành từ 5 thùng"><Num value={s.eu.boxCut5} onChange={(v) => up((d) => { d.eu.boxCut5 = n0(v); })} /></Field>
              <Field label="Sức chứa túi 1"><Num value={s.eu.cap1} onChange={(v) => up((d) => { d.eu.cap1 = n0(v); })} /></Field>
              <Field label="Túi 5"><Num value={s.eu.cap5} onChange={(v) => up((d) => { d.eu.cap5 = n0(v); })} /></Field>
              <Field label="Túi 10"><Num value={s.eu.cap10} onChange={(v) => up((d) => { d.eu.cap10 = n0(v); })} /></Field>
              <Toggle checked={s.eu.handlingEnabled} onChange={(v) => up((d) => { d.eu.handlingEnabled = v; })} label="Phí handling" />
              <Field label="Handling tối thiểu (€)"><Num value={s.eu.handlingMin} onChange={(v) => up((d) => { d.eu.handlingMin = n0(v); })} /></Field>
              <Field label="Ngưỡng đơn (€)"><Num value={s.eu.handlingThreshold} onChange={(v) => up((d) => { d.eu.handlingThreshold = n0(v); })} /></Field>
              <Field label="Handling trên ngưỡng (%)"><Num value={s.eu.handlingPct} onChange={(v) => up((d) => { d.eu.handlingPct = n0(v); })} /></Field>
              <Field label="Bảo hiểm DHL (%)"><Num value={s.eu.insurancePct} onChange={(v) => up((d) => { d.eu.insurancePct = n0(v); })} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Úc (AUS — Leafia)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-4 items-end">
                <Toggle checked={s.au.gstEnabled} onChange={(v) => up((d) => { d.au.gstEnabled = v; })} label="Thuế GST" />
                <Field label="GST (%)"><Num value={s.au.gstPct} onChange={(v) => up((d) => { d.au.gstPct = n0(v); })} /></Field>
                <Field label="Túi 5: tối thiểu cây"><Num value={s.au.min5} onChange={(v) => up((d) => { d.au.min5 = n0(v); })} /></Field>
                <Field label="Túi 1: tối thiểu túi"><Num value={s.au.min1} onChange={(v) => up((d) => { d.au.min1 = n0(v); })} /></Field>
              </div>
              <p className="text-xs text-text-secondary">Cước VN → kho QLD theo tổng số cây (A$/cây):</p>
              <div className="flex flex-wrap gap-3">
                {s.au.shipTiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-1 text-sm">
                    <Num className="h-8 w-16" value={t.min} onChange={(v) => up((d) => { d.au.shipTiers[i].min = n0(v); })} />–
                    <Num className="h-8 w-20" value={t.max} onChange={(v) => up((d) => { d.au.shipTiers[i].max = n0(v); })} />:
                    <Num className="h-8 w-16" value={t.rate} onChange={(v) => up((d) => { d.au.shipTiers[i].rate = n0(v); })} />
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto border border-divider rounded-lg">
                <table className="text-sm">
                  <thead><tr className="bg-primary-light">{["Thùng", "Túi 1", "Túi 5", "Đóng gói", "Trong QLD", "Ngoài QLD"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {s.au.boxes.map((b, i) => (
                      <tr key={i} className="border-b border-divider last:border-0">
                        <td className="px-2 py-1"><Input className="h-8 w-56" value={b.name} onChange={(e) => up((d) => { d.au.boxes[i].name = e.target.value; })} /></td>
                        {(["cap1", "cap5", "pack", "qld", "out"] as const).map((k) => (
                          <td key={k} className="px-1 py-1"><Num className="h-8 w-20" value={b[k]} onChange={(v) => up((d) => { d.au.boxes[i][k] = n0(v); })} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Đông Nam Á & Singapore — phí ship/cây (đơn vị tiền gốc thị trường)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-4 items-end">
                <Field label="Giảm ship đơn đầy thùng (%)"><Num value={s.sea.fullBoxPct} onChange={(v) => up((d) => { d.sea.fullBoxPct = n0(v); })} /></Field>
                <Field label="SG miễn ship từ (S$)"><Num value={s.sea.sgFreeThreshold} onChange={(v) => up((d) => { d.sea.sgFreeThreshold = n0(v); })} /></Field>
                <Field label="SG giao tận cửa (S$/điểm)"><Num value={s.sea.sgDoorFee} onChange={(v) => up((d) => { d.sea.sgDoorFee = n0(v); })} /></Field>
              </div>
              <div className="overflow-x-auto border border-divider rounded-lg">
                <table className="text-sm">
                  <thead><tr className="bg-primary-light">
                    <th className={th}>Thị trường</th><th className={th}>Ship tối thiểu</th>
                    {SHIP_CATS.map(([k, l]) => <th key={k} className={th}>{l}</th>)}
                  </tr></thead>
                  <tbody>
                    {seaMarkets.map((m) => (
                      <tr key={m.code} className="border-b border-divider last:border-0">
                        <td className="px-2 py-1 whitespace-nowrap">{m.code} <span className="text-xs text-text-muted">{m.currency}</span></td>
                        <td className="px-1 py-1"><Num className="h-8 w-24" value={s.sea.minShip[m.code] ?? null} onChange={(v) => up((d) => { d.sea.minShip[m.code] = v; })} /></td>
                        {SHIP_CATS.map(([k]) => (
                          <td key={k} className="px-1 py-1">
                            <Num className="h-8 w-20" value={s.sea.rates[m.code]?.[k] ?? null} onChange={(v) => up((d) => { d.sea.rates[m.code] ??= {}; if (v == null) delete d.sea.rates[m.code][k]; else d.sea.rates[m.code][k] = v; })} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-text-secondary">Ô trống = chưa có giá — NV bán hàng phải nhập phí ship/cây tay khi lập invoice. Ship tối thiểu trống = không áp dụng.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Phí khác theo thị trường</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-text-secondary">
                Dùng cho thị trường chưa có công thức riêng (Hàn Quốc, Canada, Anh, Trung Quốc, Nội địa…) hoặc thêm khoản ngoài công thức. &quot;Tuỳ chọn&quot; = NV bán hàng tự tick khi lập invoice; không tick tuỳ chọn = luôn tính. Số tiền cố định/theo cây tính bằng đơn vị tiền gốc thị trường.
              </p>
              {markets.map((m) => {
                const list = s.extraFees[m.code] ?? [];
                const setList = (fn: (l: ExtraFee[]) => void) => up((d) => { const l = d.extraFees[m.code] ?? []; fn(l); d.extraFees[m.code] = l; });
                return (
                  <div key={m.code} className="space-y-2">
                    <p className="text-sm font-bold">{m.code} · {m.name} <span className="text-xs text-text-muted font-normal">({m.currency})</span></p>
                    {list.map((f, i) => (
                      <div key={f.id} className="flex flex-wrap gap-2 items-center">
                        <Checkbox checked={f.enabled} onCheckedChange={(c) => setList((l) => { l[i].enabled = !!c; })} />
                        <Input className="h-8 w-56" value={f.label} placeholder="Tên khoản phí" onChange={(e) => setList((l) => { l[i].label = e.target.value; })} />
                        <select className="h-8 rounded-md border border-border bg-background px-2 text-sm" value={f.kind} onChange={(e) => setList((l) => { l[i].kind = e.target.value as ExtraFeeKind; })}>
                          {Object.entries(FEE_KINDS).map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}
                        </select>
                        <Num value={f.value} onChange={(v) => setList((l) => { l[i].value = n0(v); })} />
                        <Toggle checked={f.optional} onChange={(v) => setList((l) => { l[i].optional = v; })} label="Tuỳ chọn" />
                        <Button variant="outline" size="sm" className="h-8" onClick={() => setList((l) => { l.splice(i, 1); })}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setList((l) => { l.push({ id: Math.random().toString(36).slice(2, 10), label: "", kind: "PCT_GOODS", value: 0, enabled: true, optional: false }); })}>
                      <Plus className="w-4 h-4 mr-1" /> Thêm khoản phí
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="sticky bottom-4 flex justify-end">
            <Button onClick={saveAll} disabled={saving || dis}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Lưu cài đặt</Button>
          </div>
        </>
      )}
    </div>
  );
}
