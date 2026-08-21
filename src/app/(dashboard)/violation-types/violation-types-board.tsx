"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, ShieldAlert, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import RecordViolationDialog from "./record-violation-dialog";

type ViolationType = { id: string; label: string; points: number; groupName: string | null; createdAt: string };

const UNGROUPED_LABEL = "Chưa phân nhóm";
const GROUP_SUGGESTIONS_ID = "violation-group-suggestions";

// Gộp danh sách loại lỗi theo groupName (null/"" gộp chung vào "Chưa phân nhóm", luôn xếp CUỐI) — chỉ để
// hiển thị/theo dõi dễ hơn, không phải danh mục cố định (xem ViolationType.groupName).
function groupByName(types: ViolationType[]): { groupName: string; items: ViolationType[] }[] {
  const map = new Map<string, ViolationType[]>();
  for (const t of types) {
    const key = t.groupName?.trim() || UNGROUPED_LABEL;
    (map.get(key) ?? map.set(key, []).get(key)!).push(t);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === UNGROUPED_LABEL ? 1 : b === UNGROUPED_LABEL ? -1 : a.localeCompare(b)))
    .map(([groupName, items]) => ({ groupName, items }));
}

export default function ViolationTypesBoard({ canCreate }: { canCreate: boolean }) {
  const [types, setTypes] = useState<ViolationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newPoints, setNewPoints] = useState("5");
  const [newGroupName, setNewGroupName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState("");
  const [editGroupName, setEditGroupName] = useState("");
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

  const groupSuggestions = useMemo(
    () => Array.from(new Set(types.map((t) => t.groupName?.trim()).filter((g): g is string => !!g))).sort(),
    [types]
  );

  const addType = async () => {
    if (!newLabel.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/violation-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), points: Number(newPoints) || 5, groupName: newGroupName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã thêm loại lỗi vi phạm");
      setNewLabel("");
      setNewPoints("5");
      setNewGroupName("");
      load();
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (t: ViolationType) => {
    setEditingId(t.id);
    setEditPoints(String(t.points));
    setEditGroupName(t.groupName ?? "");
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/violation-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: Number(editPoints) || 0, groupName: editGroupName.trim() }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã cập nhật loại lỗi");
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  const groups = groupByName(types);

  return (
    <div className="space-y-4">
      <datalist id={GROUP_SUGGESTIONS_ID}>
        {groupSuggestions.map((g) => <option key={g} value={g} />)}
      </datalist>

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
          {canCreate && (
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Nhập tên loại lỗi vi phạm mới…"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addType(); }}
                className="flex-1 min-w-[200px]"
              />
              <Input
                placeholder="Nhóm lỗi (tuỳ chọn)"
                list={GROUP_SUGGESTIONS_ID}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addType(); }}
                className="w-44"
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
          )}

          {types.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có loại lỗi vi phạm nào</p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.groupName} className="space-y-1.5">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    {g.groupName} <span className="font-normal normal-case text-text-muted">({g.items.length})</span>
                  </p>
                  <div className="rounded-lg border border-divider divide-y divide-divider">
                    {g.items.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                        <ShieldAlert className="w-4 h-4 text-warning-foreground shrink-0" />
                        <span className="text-foreground flex-1">{t.label}</span>
                        {editingId === t.id ? (
                          <>
                            <Input
                              placeholder="Nhóm lỗi"
                              list={GROUP_SUGGESTIONS_ID}
                              value={editGroupName}
                              onChange={(e) => setEditGroupName(e.target.value)}
                              className="w-36 h-8"
                            />
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
