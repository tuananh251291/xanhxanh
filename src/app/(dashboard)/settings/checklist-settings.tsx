"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, Loader2, Plus, Trash2, Pencil, Check, X, Save } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/types";
import type { UserRole } from "@prisma/client";

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

type Template = { id: string; role: UserRole; title: string; sortOrder: number; isActive: boolean };
type Threshold = { role: UserRole; minPercent: number };

export default function ChecklistSettings() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [role, setRole] = useState<UserRole>("CAY_MO");
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [thresholdInput, setThresholdInput] = useState("80");
  const [savingThreshold, setSavingThreshold] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, thRes] = await Promise.all([
        fetch("/api/checklist-templates"),
        fetch("/api/checklist-thresholds"),
      ]);
      setTemplates(await tRes.json());
      setThresholds(await thRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = thresholds.find((x) => x.role === role);
    setThresholdInput(String(t?.minPercent ?? 80));
  }, [role, thresholds]);

  const roleTemplates = templates.filter((t) => t.role === role).sort((a, b) => a.sortOrder - b.sortOrder);

  const addTemplate = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, title: newTitle.trim() }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      setNewTitle("");
      load();
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (t: Template) => {
    await fetch(`/api/checklist-templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    load();
  };

  const startEdit = (t: Template) => { setEditingId(t.id); setEditingTitle(t.title); };

  const saveEdit = async (id: string) => {
    if (!editingTitle.trim()) return;
    await fetch(`/api/checklist-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editingTitle.trim() }),
    });
    setEditingId(null);
    load();
  };

  const removeTemplate = async (t: Template) => {
    const res = await fetch(`/api/checklist-templates/${t.id}`, { method: "DELETE" });
    const json = await res.json();
    toast.success(json.deactivated ? "Đã có lịch sử — chuyển sang ẩn thay vì xóa" : "Đã xóa");
    load();
  };

  const saveThreshold = async () => {
    const value = parseInt(thresholdInput, 10);
    if (Number.isNaN(value) || value < 0 || value > 100) { toast.error("Ngưỡng phải từ 0-100"); return; }
    setSavingThreshold(true);
    try {
      const res = await fetch("/api/checklist-thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ role, minPercent: value }]),
      });
      if (!res.ok) { toast.error("Lưu thất bại"); return; }
      toast.success("Đã lưu ngưỡng cảnh báo");
      load();
    } finally {
      setSavingThreshold(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="w-4 h-4" /> Checklist đầu việc hàng ngày
        </CardTitle>
        <p className="text-sm text-gray-500">Soạn đầu việc theo từng vai trò và ngưỡng % cảnh báo nếu hoàn thành không đạt</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 max-w-xs">
          <Label>Vai trò</Label>
          <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 max-w-xs">
          <Label>Ngưỡng % hoàn thành tối thiểu/ngày</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={0} max={100} className="w-24"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
            />
            <span className="text-sm text-gray-500">%</span>
            <Button size="sm" variant="outline" onClick={saveThreshold} disabled={savingThreshold}>
              {savingThreshold ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="border-t pt-3 space-y-1">
          {roleTemplates.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">Chưa có đầu việc nào cho vai trò này</p>
          ) : (
            roleTemplates.map((t) => (
              <div key={t.id} className={`flex items-center gap-2 py-1.5 text-sm ${!t.isActive ? "opacity-50" : ""}`}>
                {editingId === t.id ? (
                  <>
                    <Input value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} className="flex-1 h-8" />
                    <Button size="sm" variant="ghost" onClick={() => saveEdit(t.id)}><Check className="w-4 h-4 text-green-600" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4 text-gray-400" /></Button>
                  </>
                ) : (
                  <>
                    <Checkbox checked={t.isActive} onCheckedChange={() => toggleActive(t)} />
                    <span className="flex-1">{t.title}</span>
                    {!t.isActive && <span className="text-xs text-gray-400">(đã ẩn)</span>}
                    <Button size="sm" variant="ghost" onClick={() => startEdit(t)}><Pencil className="w-3.5 h-3.5 text-gray-400" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => removeTemplate(t)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Input
            placeholder="Nội dung đầu việc mới..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTemplate(); }}
          />
          <Button onClick={addTemplate} disabled={adding || !newTitle.trim()} className="bg-cyan-600 hover:bg-cyan-700 shrink-0">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Thêm
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
