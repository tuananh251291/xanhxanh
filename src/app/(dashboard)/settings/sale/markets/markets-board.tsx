"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";

type Market = {
  id: string; code: string; name: string; isActive: boolean;
  currency: string; derivedCurrency: string | null; invoiceCalcKind: string; priceListEnabled: boolean;
};
// Kiểu tính phí ship/thuế khi lập invoice (xem Market.invoiceCalcKind).
const CALC_KINDS: Record<string, string> = { US: "Mỹ", EU: "EU (Hà Lan)", AU: "Úc", SEA: "Đông Nam Á", SG: "Singapore", SIMPLE: "Đơn giản" };

// readOnly: NV Trợ lý chỉ xem — ẩn nút sửa + ô thêm mới, khoá ô Hoạt động.
export default function MarketsBoard({ readOnly = false }: { readOnly?: boolean }) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState("");
  const [editingName, setEditingName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/markets");
      setMarkets(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addMarket = async () => {
    if (!newCode.trim() || !newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      setNewCode("");
      setNewName("");
      load();
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (m: Market) => {
    await fetch(`/api/markets/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !m.isActive }),
    });
    load();
  };

  // Bảng giá & invoice — đơn vị tiền, đơn vị tự tạo, kiểu tính, có dùng bảng giá tháng.
  const [editingInv, setEditingInv] = useState({ currency: "USD", derivedCurrency: "", invoiceCalcKind: "SIMPLE", priceListEnabled: true });
  const startEdit = (m: Market) => {
    setEditingId(m.id); setEditingCode(m.code); setEditingName(m.name);
    setEditingInv({ currency: m.currency, derivedCurrency: m.derivedCurrency ?? "", invoiceCalcKind: m.invoiceCalcKind, priceListEnabled: m.priceListEnabled });
  };

  const saveEdit = async (id: string) => {
    if (!editingCode.trim() || !editingName.trim()) return;
    const res = await fetch(`/api/markets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: editingCode.trim(), name: editingName.trim(),
        currency: editingInv.currency.trim(), derivedCurrency: editingInv.derivedCurrency.trim() || null,
        invoiceCalcKind: editingInv.invoiceCalcKind, priceListEnabled: editingInv.priceListEnabled,
      }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
    setEditingId(null);
    load();
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tên đầy đủ</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Đơn vị tiền</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Kiểu tính đơn đặt hàng</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Bảng giá tháng</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Hoạt động</th>
                {!readOnly && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {markets.length === 0 ? (
                <tr><td colSpan={readOnly ? 6 : 7} className="text-center py-6 text-text-muted">Chưa có thị trường nào</td></tr>
              ) : (
                markets.map((m) => (
                  <tr key={m.id} className={!m.isActive ? "opacity-50" : ""}>
                    {editingId === m.id && !readOnly ? (
                      <>
                        <td className="px-3 py-2"><Input value={editingCode} onChange={(e) => setEditingCode(e.target.value)} className="h-8 w-24" /></td>
                        <td className="px-3 py-2"><Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-8" /></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Input value={editingInv.currency} onChange={(e) => setEditingInv((v) => ({ ...v, currency: e.target.value.toUpperCase() }))} className="h-8 w-16" maxLength={3} />
                            <span className="text-xs text-text-muted">+</span>
                            <Input value={editingInv.derivedCurrency} placeholder="tự tạo" onChange={(e) => setEditingInv((v) => ({ ...v, derivedCurrency: e.target.value.toUpperCase() }))} className="h-8 w-20" maxLength={3} />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select className="h-8 rounded-md border border-border bg-background px-2 text-sm" value={editingInv.invoiceCalcKind} onChange={(e) => setEditingInv((v) => ({ ...v, invoiceCalcKind: e.target.value }))}>
                            {Object.entries(CALC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><Checkbox checked={editingInv.priceListEnabled} onCheckedChange={(c) => setEditingInv((v) => ({ ...v, priceListEnabled: !!c }))} /></td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => saveEdit(m.id)}><Check className="w-4 h-4 text-primary-strong" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4 text-text-muted" /></Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-mono font-medium">{m.code}</td>
                        <td className="px-3 py-2">{m.name}</td>
                        <td className="px-3 py-2 font-mono">{m.currency}{m.derivedCurrency && <span className="text-xs text-text-muted font-sans"> (+{m.derivedCurrency} tự tạo)</span>}</td>
                        <td className="px-3 py-2">{CALC_KINDS[m.invoiceCalcKind] ?? m.invoiceCalcKind}</td>
                        <td className="px-3 py-2">{m.priceListEnabled ? "Có" : "Không"}</td>
                        <td className="px-3 py-2"><Checkbox checked={m.isActive} disabled={readOnly} onCheckedChange={() => toggleActive(m)} /></td>
                        {!readOnly && (
                          <td className="px-3 py-2">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(m)}><Pencil className="w-3.5 h-3.5 text-text-muted" /></Button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!readOnly && <div className="flex items-center gap-2 pt-2 border-t border-divider">
          <Input placeholder="Mã (VD: EU)" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-32" />
          <Input placeholder="Tên đầy đủ (VD: Châu Âu)" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" onKeyDown={(e) => { if (e.key === "Enter") addMarket(); }} />
          <Button onClick={addMarket} disabled={adding || !newCode.trim() || !newName.trim()} className="bg-secondary hover:bg-secondary-hover shrink-0">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Thêm
          </Button>
        </div>}
      </CardContent>
    </Card>
  );
}
