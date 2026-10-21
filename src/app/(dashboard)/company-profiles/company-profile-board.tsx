"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, PenLine, Plus } from "lucide-react";
import { toast } from "sonner";

type Profile = { id: string; name: string; address: string; email: string; phone: string | null; taxCode: string | null; bankInfo: string | null; note: string | null; isActive: boolean; sortOrder: number };
const EMPTY = { name: "", address: "", email: "", phone: "", taxCode: "", bankInfo: "", note: "", isActive: true, sortOrder: 0 };

export default function CompanyProfileBoard() {
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: typeof EMPTY } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/company-profiles");
    setRows(res.ok ? await res.json() : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const body = { ...editing.form, phone: editing.form.phone || null, taxCode: editing.form.taxCode || null, bankInfo: editing.form.bankInfo || null, note: editing.form.note || null };
      const res = await fetch(editing.id ? `/api/company-profiles/${editing.id}` : "/api/company-profiles", {
        method: editing.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã lưu");
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof EMPTY, v: string | boolean | number) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  if (!rows) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  return (
    <div className="space-y-4">
      <Button onClick={() => setEditing({ id: null, form: { ...EMPTY } })}><Plus className="w-4 h-4 mr-1.5" /> Thêm mẫu công ty</Button>
      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">Chưa có mẫu nào</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4 space-y-1 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-foreground">{p.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={p.isActive ? "completed" : "outline"}>{p.isActive ? "Đang dùng" : "Tắt"}</Badge>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing({ id: p.id, form: { ...EMPTY, ...p, phone: p.phone ?? "", taxCode: p.taxCode ?? "", bankInfo: p.bankInfo ?? "", note: p.note ?? "" } })}>
                      <PenLine className="w-3.5 h-3.5 mr-1" /> Sửa
                    </Button>
                  </div>
                </div>
                <p className="text-text-secondary">{p.address}</p>
                <p className="text-text-secondary">{p.email}{p.phone ? ` · ${p.phone}` : ""}{p.taxCode ? ` · MST ${p.taxCode}` : ""}</p>
                {p.bankInfo && <p className="text-xs text-text-muted whitespace-pre-line">{p.bankInfo}</p>}
                {p.note && <p className="text-xs text-text-muted">{p.note}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o && !saving) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Sửa mẫu công ty" : "Thêm mẫu công ty"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-2 text-sm">
              {([["name", "Tên công ty *", "XANH XANH URBAN FOREST CO., LTD"], ["address", "Địa chỉ *", "No 01, 74 Goc De, Hoang Van Thu, Hoang Mai, Ha Noi, Vietnam"], ["email", "Email *", "salesglobal@xanhxanhurbanforest.com"], ["phone", "Điện thoại", ""], ["taxCode", "Mã số thuế", ""]] as const).map(([k, label, ph]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input value={String(editing.form[k] ?? "")} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
                </div>
              ))}
              <div className="space-y-1">
                <Label className="text-xs">Thông tin ngân hàng (in cuối phiếu báo giá)</Label>
                <textarea className="w-full min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm" value={editing.form.bankInfo} onChange={(e) => set("bankInfo", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ghi chú nội bộ (VD dùng cho thị trường nào)</Label>
                <Input value={editing.form.note} onChange={(e) => set("note", e.target.value)} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" checked={editing.form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Đang dùng</label>
                <label className="flex items-center gap-2">Thứ tự <Input type="number" className="h-8 w-20" value={editing.form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} /></label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Huỷ</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
