"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Pencil, Check, X, CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Holiday = { id: string; date: string; description: string; isPaid: boolean };

export default function PublicHolidaysBoard() {
  const [rows, setRows] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPaid, setNewPaid] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editPaid, setEditPaid] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/public-holidays");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addHoliday = async () => {
    if (!newDate || !newDesc.trim()) { toast.error("Cần chọn ngày và nhập nội dung"); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/payroll/public-holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate, description: newDesc.trim(), isPaid: newPaid }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã thêm ngày nghỉ lễ");
      setNewDate("");
      setNewDesc("");
      setNewPaid(true);
      load();
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (h: Holiday) => {
    setEditingId(h.id);
    setEditDesc(h.description);
    setEditPaid(h.isPaid);
  };

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/payroll/public-holidays/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: editDesc.trim(), isPaid: editPaid }),
    });
    if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
    toast.success("Đã cập nhật");
    setEditingId(null);
    load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Xoá ngày nghỉ lễ này?")) return;
    const res = await fetch(`/api/payroll/public-holidays/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
    toast.success("Đã xoá");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-text-secondary">
            Mọi ngày trong danh sách đều trừ khỏi Ngày công tiêu chuẩn — bật &quot;Hưởng lương&quot; thì
            NV vẫn được cộng vào Ngày công hưởng lương dù nghỉ ngày đó.
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Ngày</label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <label className="text-xs text-text-secondary">Nội dung</label>
              <Input placeholder="VD: Nghỉ Tết Dương lịch" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
              <Checkbox checked={newPaid} onCheckedChange={(v) => setNewPaid(v === true)} />
              Hưởng lương
            </label>
            <Button onClick={addHoliday} disabled={adding} className="bg-primary hover:bg-primary-hover">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Thêm dòng
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted"><p>Chưa có ngày nghỉ lễ nào</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-lg divide-y divide-divider">
              {rows.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3 text-sm flex-wrap">
                  <CalendarOff className="w-4 h-4 text-warning-foreground shrink-0" />
                  <span className="font-medium text-foreground w-28 shrink-0">
                    {format(new Date(h.date), "dd/MM/yyyy", { locale: vi })}
                  </span>
                  {editingId === h.id ? (
                    <>
                      <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="flex-1 h-8 min-w-[160px]" />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={editPaid} onCheckedChange={(v) => setEditPaid(v === true)} />
                        Hưởng lương
                      </label>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveEdit(h.id)}>
                        <Check className="w-4 h-4 text-primary-strong" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-foreground">{h.description}</span>
                      <Badge className={h.isPaid ? "bg-primary-light text-primary-strong" : "bg-muted text-text-secondary"}>
                        {h.isPaid ? "Hưởng lương" : "Không hưởng lương"}
                      </Badge>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(h)}>
                        <Pencil className="w-3.5 h-3.5 text-text-muted" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(h.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
