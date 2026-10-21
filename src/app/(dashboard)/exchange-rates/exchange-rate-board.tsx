"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { monthLabelVi } from "@/lib/price-list-shared";

type Rate = { currency: string; vndPerUnit: number; perUsd: number | null };
type Data = {
  month: string; thisMonth: string; currencies: string[];
  rates: (Rate & { updatedBy: string; updatedAt: string })[];
  previous: Rate[];
  history: (Rate & { month: string })[];
};

// "16.500" (dấu chấm ngăn cách nghìn kiểu VN) → coi là lỗi, tránh hiểu nhầm thành 16,5. Cho phép "16500", "16,500", "0.3".
function parseNum(s: string): number | null | "bad" {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return "bad";
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : "bad";
}

export default function ExchangeRateBoard({ canEdit }: { canEdit: boolean }) {
  const [month, setMonth] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, { vnd: string; usd: string }>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (m?: string) => {
    const res = await fetch(`/api/exchange-rates${m ? `?month=${m}` : ""}`);
    const json: Data & { message?: string } = await res.json();
    if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
    setData(json);
    setMonth(json.month);
    const src = json.rates.length ? json.rates : json.previous;
    setDraft(Object.fromEntries(json.currencies.map((c) => {
      const r = src.find((x) => x.currency === c);
      return [c, { vnd: r ? String(r.vndPerUnit) : "", usd: r?.perUsd != null && c !== "USD" ? String(r.perUsd) : "" }];
    })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!data) return;
    const rates = [];
    for (const c of data.currencies) {
      const vnd = parseNum(draft[c]?.vnd ?? "");
      const usd = c === "USD" ? 1 : parseNum(draft[c]?.usd ?? "");
      if (vnd === "bad" || usd === "bad") { toast.error(`${c}: số không hợp lệ — không dùng dấu chấm ngăn cách hàng nghìn (gõ 16500 hoặc 16,500)`); return; }
      if (vnd == null) { toast.error(`${c}: chưa nhập tỉ giá VND`); return; }
      rates.push({ currency: c, vndPerUnit: vnd, perUsd: usd });
    }
    setSaving(true);
    try {
      const res = await fetch("/api/exchange-rates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, rates }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã lưu tỉ giá ${monthLabelVi(month)}`);
      load(month);
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  const prev = (c: string) => data.previous.find((p) => p.currency === c);
  const saved = (c: string) => data.rates.find((p) => p.currency === c);
  const historyMonths = [...new Set(data.history.map((h) => h.month))];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tháng</Label>
              <Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); if (e.target.value) load(e.target.value); }} className="w-44" />
            </div>
            <CardTitle className="text-base pb-2">Tỉ giá {monthLabelVi(month)} {data.rates.length ? "" : "— chưa nhập (đang hiện số tháng trước để sửa)"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto border border-divider rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Đơn vị tiền</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">1 đơn vị = ? VND</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">1 USD = ? đơn vị</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tháng trước</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Đã lưu</th>
                </tr>
              </thead>
              <tbody>
                {data.currencies.map((c) => (
                  <tr key={c} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono font-medium">{c}</td>
                    <td className="px-3 py-2">
                      <Input className="h-8 w-36" value={draft[c]?.vnd ?? ""} disabled={!canEdit} placeholder="VD 25800"
                        onChange={(e) => setDraft((d) => ({ ...d, [c]: { ...d[c], vnd: e.target.value } }))} />
                    </td>
                    <td className="px-3 py-2">
                      {c === "USD" ? <span className="text-text-muted">1</span> : (
                        <Input className="h-8 w-36" value={draft[c]?.usd ?? ""} disabled={!canEdit} placeholder="VD 16500"
                          onChange={(e) => setDraft((d) => ({ ...d, [c]: { ...d[c], usd: e.target.value } }))} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-secondary tabular-nums">{prev(c) ? `${prev(c)!.vndPerUnit.toLocaleString("en-US")} VND${prev(c)!.perUsd && c !== "USD" ? ` · 1 USD = ${prev(c)!.perUsd!.toLocaleString("en-US")}` : ""}` : "—"}</td>
                    <td className="px-3 py-2 text-xs text-text-muted">{saved(c) ? `${saved(c)!.updatedBy} · ${new Date(saved(c)!.updatedAt).toLocaleDateString("vi-VN")}` : "Chưa lưu"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-secondary">
            Không dùng dấu chấm để ngăn cách hàng nghìn: gõ <b>16500</b> hoặc <b>16,500</b> (không gõ 16.500). Dấu chấm chỉ dùng cho số thập phân, VD 1.4.
            &quot;1 USD = ? đơn vị&quot; dùng cho phụ thu túi 1 cây Đông Nam Á (0.30 USD × tỉ giá) — có thể khác tỉ giá chéo qua VND.
          </p>
          {canEdit && (
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Lưu tỉ giá {monthLabelVi(month)}</Button>
          )}
        </CardContent>
      </Card>

      {historyMonths.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Lịch sử (1 đơn vị = ? VND)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tháng</th>
                    {data.currencies.map((c) => <th key={c} className="text-right px-3 py-2 text-base text-primary-strong font-bold">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {historyMonths.map((m) => (
                    <tr key={m} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-3 py-2">{monthLabelVi(m)}</td>
                      {data.currencies.map((c) => {
                        const h = data.history.find((x) => x.month === m && x.currency === c);
                        return <td key={c} className="px-3 py-2 text-right tabular-nums">{h ? h.vndPerUnit.toLocaleString("en-US") : "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
