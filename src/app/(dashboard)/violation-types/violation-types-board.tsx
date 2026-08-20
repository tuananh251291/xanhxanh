"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, ShieldAlert, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import RecordViolationDialog from "./record-violation-dialog";

type ViolationType = { id: string; label: string; points: number; createdAt: string };

export default function ViolationTypesBoard() {
  const [types, setTypes] = useState<ViolationType[]>([]);
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
      const res = await fetch("/api/violation-types");
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
      const res = await fetch("/api/violation-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), points: Number(newPoints) || 5 }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã thêm loại lỗi vi phạm");
      setNewLabel("");
      setNewPoints("5");
      load();
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (t: ViolationType) => {
    setEditingId(t.id);
    setEditPoints(String(t.points));
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/violation-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: Number(editPoints) || 0 }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã cập nhật điểm trừ");
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-text-secondary">
            Ghi nhận trực tiếp 1 lỗi vi phạm cho NV cấy mô, không cần qua lượt kiểm tra nào.
          </p>
          <RecordViolationDialog violationTypes={types} onSaved={load} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Nhập tên loại lỗi vi phạm mới…"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addType(); }}
              className="flex-1 min-w-[200px]"
            />
            <Input
              type="number"
              min={0}
              placeholder="Điểm trừ"
              value={newPoints}
              onChange={(e) => setNewPoints(e.target.value)}
              className="w-24"
            />
            <Button onClick={addType} disabled={adding || !newLabel.trim()} className="bg-primary hover:bg-primary-hover shrink-0">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Thêm
            </Button>
          </div>

          {types.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có loại lỗi vi phạm nào</p>
          ) : (
            <div className="rounded-lg border border-divider divide-y divide-divider">
              {types.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                  <ShieldAlert className="w-4 h-4 text-warning-foreground shrink-0" />
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
                      <span className="text-xs text-text-muted whitespace-nowrap">−{t.points} điểm</span>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(t)}>
                        <Pencil className="w-3.5 h-3.5 text-text-muted" />
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
