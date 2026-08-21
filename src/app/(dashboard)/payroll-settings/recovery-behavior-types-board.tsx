"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, ShieldCheck, Pencil, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

type BehaviorType = { id: string; label: string; points: number; createdAt: string };

// Danh mục "hành vi" được cộng điểm phục hồi — HR soạn sẵn ở đây, dùng làm gợi ý (chọn 1 hành vi tự điền
// sẵn điểm) khi thêm điểm phục hồi cho 1 NV/1 kỳ ở tab "Điểm phục hồi" (xem compliance-recovery-board.tsx).
export default function RecoveryBehaviorTypesBoard() {
  const [types, setTypes] = useState<BehaviorType[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newPoints, setNewPoints] = useState("5");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recovery-behavior-types");
      const data = await res.json();
      setTypes(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addType = async () => {
    if (!newLabel.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/recovery-behavior-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), points: Number(newPoints) || 5 }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã thêm hành vi phục hồi");
      setNewLabel("");
      setNewPoints("5");
      load();
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (t: BehaviorType) => {
    setEditingId(t.id);
    setEditPoints(String(t.points));
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/recovery-behavior-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: Number(editPoints) || 0 }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã cập nhật hành vi");
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Xoá hành vi này khỏi danh mục?")) return;
    const res = await fetch(`/api/recovery-behavior-types/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
    toast.success("Đã xoá");
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Danh mục hành vi được cộng điểm phục hồi — chọn từ danh mục này khi thêm điểm phục hồi ở tab &quot;Điểm phục hồi&quot; sẽ tự điền sẵn số điểm.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Nhập tên hành vi mới…"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addType(); }}
              className="flex-1 min-w-[220px]"
            />
            <Input
              type="number"
              min={0}
              placeholder="Điểm phục hồi"
              value={newPoints}
              onChange={(e) => setNewPoints(e.target.value)}
              className="w-32"
            />
            <Button onClick={addType} disabled={adding || !newLabel.trim()} className="bg-primary hover:bg-primary-hover shrink-0">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Thêm
            </Button>
          </div>

          {types.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có hành vi phục hồi nào</p>
          ) : (
            <div className="rounded-lg border border-divider divide-y divide-divider">
              {types.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                  <ShieldCheck className="w-4 h-4 text-primary-strong shrink-0" />
                  <span className="text-foreground flex-1">{t.label}</span>
                  {editingId === t.id ? (
                    <>
                      <Input
                        type="number" min={0} value={editPoints}
                        onChange={(e) => setEditPoints(e.target.value)}
                        className="w-20 h-8"
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={saving} onClick={() => saveEdit(t.id)}>
                        <Check className="w-4 h-4 text-primary-strong" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-text-muted whitespace-nowrap">+{t.points} điểm</span>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(t)}>
                        <Pencil className="w-3.5 h-3.5 text-text-muted" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(t.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
