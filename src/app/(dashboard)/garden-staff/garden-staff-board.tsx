"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { GARDEN_STAFF_TYPE_LABELS, GARDEN_STAFF_TYPES, type GardenStaffTypeKey } from "@/lib/garden-staff-constants";

type Garden = { id: string; code: string; name: string };
type Staff = { id: string; name: string; phone: string | null; types: GardenStaffTypeKey[]; notes: string | null; user: { id: string; code: string; name: string } | null };
type FormState = { id: string | null; name: string; phone: string; types: GardenStaffTypeKey[]; notes: string; userId: string };
type Account = { id: string; code: string; name: string; linkedStaffId: string | null };

const emptyForm: FormState = { id: null, name: "", phone: "", types: [], notes: "", userId: "" };
const ALL = "ALL";

export default function GardenStaffBoard({ gardens, accounts }: { gardens: Garden[]; accounts: Account[] }) {
  const [gardenId, setGardenId] = useState(gardens[0].id);
  const [staff, setStaff] = useState<Staff[]>([]);
  // Đang tải = danh sách hiện có chưa phải của đúng vườn + lần tải mới nhất (đổi vườn hoặc vừa thêm/sửa/xoá).
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== `${gardenId}:${reloadKey}`;
  const [filter, setFilter] = useState<GardenStaffTypeKey | typeof ALL>(ALL);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Staff | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = `${gardenId}:${reloadKey}`;
    fetch(`/api/garden-staff?gardenId=${gardenId}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) { setStaff(Array.isArray(data) ? data : []); setLoadedKey(key); } })
      .catch(() => { if (!cancelled) setLoadedKey(key); });
    return () => { cancelled = true; };
  }, [gardenId, reloadKey]);
  const load = () => setReloadKey((k) => k + 1);

  const countByType = useMemo(() => {
    const m = new Map<GardenStaffTypeKey, number>();
    for (const s of staff) for (const t of s.types) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [staff]);
  const shown = filter === ALL ? staff : staff.filter((s) => s.types.includes(filter));

  const toggleType = (t: GardenStaffTypeKey) =>
    setForm((f) => f && ({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] }));

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { toast.error("Cần nhập họ tên"); return; }
    if (form.types.length === 0) { toast.error("Chọn ít nhất 1 vị trí"); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(), phone: form.phone.trim() || undefined, types: form.types, notes: form.notes.trim() || undefined,
        // Tài khoản chỉ giữ khi còn vị trí Chăm sóc cây mô; "" = không liên kết.
        userId: form.types.includes("CHAM_SOC_CAY_MO") ? form.userId : "",
      };
      const res = await fetch(form.id ? `/api/garden-staff/${form.id}` : "/api/garden-staff", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id ? body : { ...body, gardenId }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(form.id ? "Đã cập nhật nhân viên" : "Đã thêm nhân viên");
      setForm(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/garden-staff/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã xoá ${deleting.name}`);
      setDeleting(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary-strong" /> Nhân sự vườn
          </h1>
          <p className="text-text-secondary text-sm mt-1">Nhân viên làm việc tại vườn (không có tài khoản đăng nhập) — mỗi người có thể kiêm nhiều vị trí.</p>
        </div>
        <Button onClick={() => setForm({ ...emptyForm })}><Plus className="w-4 h-4 mr-1.5" /> Thêm nhân viên</Button>
      </div>

      {gardens.length > 1 && (
        <Select
          items={gardens.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
          value={gardenId}
          onValueChange={(v) => { setGardenId(v as string); setFilter(ALL); }}
        >
          <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            {gardens.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.code})</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === ALL ? "default" : "outline"} onClick={() => setFilter(ALL)}>Tất cả ({staff.length})</Button>
        {GARDEN_STAFF_TYPES.map((t) => (
          <Button key={t} size="sm" variant={filter === t ? "default" : "outline"} onClick={() => setFilter(t)}>
            {GARDEN_STAFF_TYPE_LABELS[t]} ({countByType.get(t) ?? 0})
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Danh sách nhân viên</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
          ) : shown.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-10">Chưa có nhân viên nào — bấm &quot;Thêm nhân viên&quot;</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Họ tên</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Số điện thoại</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Vị trí</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Ghi chú</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.id} className="border-b border-divider last:border-0 even:bg-primary-light/30 align-top">
                      <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">
                        {s.name}
                        {s.user && <p className="text-xs font-normal text-text-secondary">Tài khoản: {s.user.name} ({s.user.code})</p>}
                      </td>
                      <td className="px-4 py-2 text-text-secondary whitespace-nowrap">{s.phone || "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {s.types.map((t) => <Badge key={t} variant="completed">{GARDEN_STAFF_TYPE_LABELS[t]}</Badge>)}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{s.notes || "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="ghost" title="Sửa"
                            onClick={() => setForm({ id: s.id, name: s.name, phone: s.phone ?? "", types: s.types, notes: s.notes ?? "", userId: s.user?.id ?? "" })}>
                            <Pencil className="w-3.5 h-3.5 text-text-muted" />
                          </Button>
                          <Button size="icon-sm" variant="ghost" title="Xoá" className="text-destructive hover:bg-danger-light" onClick={() => setDeleting(s)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o && !saving) setForm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{form?.id ? "Sửa nhân viên" : "Thêm nhân viên"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Họ tên</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} placeholder="VD: Nguyễn Văn A" />
              </div>
              <div className="space-y-1">
                <Label>Số điện thoại <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} inputMode="tel" />
              </div>
              <div className="space-y-1.5">
                <Label>Vị trí <span className="text-text-muted font-normal">(chọn 1 hoặc nhiều)</span></Label>
                <div className="rounded-lg border border-divider divide-y divide-divider">
                  {GARDEN_STAFF_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                      <Checkbox checked={form.types.includes(t)} onCheckedChange={() => toggleType(t)} />
                      {GARDEN_STAFF_TYPE_LABELS[t]}
                    </label>
                  ))}
                </div>
              </div>
              {form.types.includes("CHAM_SOC_CAY_MO") && (
                <div className="space-y-1">
                  <Label>Tài khoản đăng nhập <span className="text-text-muted font-normal">(NV chăm sóc cây mô)</span></Label>
                  <Select
                    items={[{ value: "", label: "Không liên kết" }, ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.code})` }))]}
                    value={form.userId}
                    onValueChange={(v) => setForm({ ...form, userId: (v as string) ?? "" })}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Chọn tài khoản" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Không liên kết</SelectItem>
                      {accounts
                        .filter((a) => !a.linkedStaffId || a.linkedStaffId === form.id)
                        .map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-text-muted">Tài khoản vai trò &quot;NV Chăm sóc cây mô&quot; do Admin/NV Hành chính nhân sự tạo ở trang Người dùng.</p>
                </div>
              )}
              <div className="space-y-1">
                <Label>Ghi chú <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>Huỷ</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {form?.id ? "Lưu" : "Thêm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o && !saving) setDeleting(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Xoá nhân viên?</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground">Xoá <strong>{deleting?.name}</strong> khỏi danh sách nhân sự vườn?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={saving}>Huỷ</Button>
            <Button className="bg-destructive hover:bg-destructive/90 text-black" onClick={remove} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
