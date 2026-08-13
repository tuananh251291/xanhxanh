"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";

type Market = { id: string; code: string; name: string; isActive: boolean };

export default function MarketsBoard() {
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

  const startEdit = (m: Market) => { setEditingId(m.id); setEditingCode(m.code); setEditingName(m.name); };

  const saveEdit = async (id: string) => {
    if (!editingCode.trim() || !editingName.trim()) return;
    const res = await fetch(`/api/markets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: editingCode.trim(), name: editingName.trim() }),
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
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Hoạt động</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {markets.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-text-muted">Chưa có thị trường nào</td></tr>
              ) : (
                markets.map((m) => (
                  <tr key={m.id} className={!m.isActive ? "opacity-50" : ""}>
                    {editingId === m.id ? (
                      <>
                        <td className="px-3 py-2"><Input value={editingCode} onChange={(e) => setEditingCode(e.target.value)} className="h-8 w-24" /></td>
                        <td className="px-3 py-2"><Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-8" /></td>
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
                        <td className="px-3 py-2"><Checkbox checked={m.isActive} onCheckedChange={() => toggleActive(m)} /></td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(m)}><Pencil className="w-3.5 h-3.5 text-text-muted" /></Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-divider">
          <Input placeholder="Mã (VD: EU)" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-32" />
          <Input placeholder="Tên đầy đủ (VD: Châu Âu)" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" onKeyDown={(e) => { if (e.key === "Enter") addMarket(); }} />
          <Button onClick={addMarket} disabled={adding || !newCode.trim() || !newName.trim()} className="bg-secondary hover:bg-secondary-hover shrink-0">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Thêm
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
