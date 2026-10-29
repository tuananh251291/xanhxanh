"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MapPin, Plus, Trash2, AlertTriangle, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

export type GardenPlaceOptions = { rows: { id: string; label: string }[]; staff: { id: string; name: string }[] };
type Lot = {
  id: string; code: string; unplaced: number; staffId: string | null;
  placements: { rowId: string; label: string; quantity: number }[];
  openTickets: { id: string; code: string; type: "PLACE" | "DAMAGE" | "SIZE_S" }[];
};
type Line = { key: number; fromRowId: string; toRowId: string; quantity: string };

const UNPLACED = "__unplaced__";
const fmt = (n: number) => n.toLocaleString("vi-VN");

// Thao tác trên 1 lô chăm sóc: QLV "Sắp xếp vị trí" (nhiều dòng: từ phần chưa xếp/dãy cũ → dãy mới, kèm NV phụ
// trách — duyệt luôn); NV phụ trách/QLV mở phiếu cây hỏng hoặc cây đạt size S (hoặc mở lại phiếu đang dở).
export default function CareLotActions({ lot, placeOptions, canReport }: { lot: Lot; placeOptions: GardenPlaceOptions | null; canReport: boolean }) {
  const router = useRouter();
  const keyRef = useRef(1);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staffId, setStaffId] = useState(lot.staffId ?? "");
  const [lines, setLines] = useState<Line[]>([{ key: 0, fromRowId: UNPLACED, toRowId: "", quantity: lot.unplaced > 0 ? String(lot.unplaced) : "" }]);

  const fromOptions = [
    ...(lot.unplaced > 0 ? [{ value: UNPLACED, label: `Chưa xếp (${fmt(lot.unplaced)} cây)` }] : []),
    ...lot.placements.map((p) => ({ value: p.rowId, label: `${p.label} (${fmt(p.quantity)} cây)` })),
  ];
  const update = (key: number, patch: Partial<Line>) => setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const openTicket = async (type: "DAMAGE" | "SIZE_S") => {
    const existing = lot.openTickets.find((t) => t.type === type);
    if (existing) { router.push(`/garden-care/tickets/${existing.id}`); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/garden-care/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: lot.id, type }) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); if (json.id) router.push(`/garden-care/tickets/${json.id}`); return; }
      router.push(`/garden-care/tickets/${json.id}`);
    } finally {
      setBusy(false);
    }
  };

  const savePlace = async () => {
    const items = lines.filter((l) => l.toRowId || l.quantity).map((l) => ({
      fromRowId: l.fromRowId === UNPLACED ? null : l.fromRowId, toRowId: l.toRowId, quantity: Number(l.quantity),
    }));
    for (const it of items) {
      if (!it.toRowId) { toast.error("Chọn dãy đích cho mọi dòng"); return; }
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) { toast.error("Nhập số cây cho mọi dòng"); return; }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/garden-care/lots/${lot.id}/place`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: staffId || undefined, items }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(json.message);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const openDamage = lot.openTickets.find((t) => t.type === "DAMAGE");
  const openSize = lot.openTickets.find((t) => t.type === "SIZE_S");

  return (
    <div className="flex flex-col items-end gap-1.5">
      {placeOptions && (
        <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => setOpen(true)}>
          <MapPin className="w-3.5 h-3.5 mr-1" /> Sắp xếp vị trí
        </Button>
      )}
      {canReport && lot.placements.length > 0 && (
        <>
          <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => openTicket("DAMAGE")}>
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> {openDamage ? `Phiếu hỏng ${openDamage.code}` : "Ghi nhận cây hỏng"}
          </Button>
          <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => openTicket("SIZE_S")}>
            <BadgeCheck className="w-3.5 h-3.5 mr-1" /> {openSize ? `Phiếu size S ${openSize.code}` : "Báo đạt size S"}
          </Button>
        </>
      )}

      {placeOptions && (
        <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader><DialogTitle>Sắp xếp vị trí lô {lot.code}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>NV chăm sóc cây mô phụ trách</Label>
                <Select
                  items={[{ value: "", label: "— Chưa giao —" }, ...placeOptions.staff.map((s) => ({ value: s.id, label: s.name }))]}
                  value={staffId}
                  onValueChange={(v) => setStaffId((v as string) ?? "")}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Chưa giao —</SelectItem>
                    {placeOptions.staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {placeOptions.staff.length === 0 && <p className="text-xs text-text-muted">Vườn chưa có NV chăm sóc cây mô — thêm ở Nhân sự vườn.</p>}
              </div>
              <div className="space-y-2">
                <Label>Xếp/điều chuyển cây</Label>
                {placeOptions.rows.length === 0 ? (
                  <p className="text-xs text-text-muted">Vườn chưa có dãy nào — tạo ở Bố trí vườn.</p>
                ) : lines.map((l) => (
                  <div key={l.key} className="grid grid-cols-[1fr_1fr_6rem_2rem] gap-2 items-center">
                    <Select items={fromOptions} value={l.fromRowId} onValueChange={(v) => update(l.key, { fromRowId: v as string })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Lấy từ" /></SelectTrigger>
                      <SelectContent>{fromOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select items={placeOptions.rows.map((r) => ({ value: r.id, label: r.label }))} value={l.toRowId || null} onValueChange={(v) => update(l.key, { toRowId: v as string })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Đến dãy" /></SelectTrigger>
                      <SelectContent>{placeOptions.rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min={1} className="h-8 text-xs" placeholder="Số cây" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                    <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:bg-danger-light" disabled={lines.length <= 1}
                      onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                {placeOptions.rows.length > 0 && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={() => setLines((p) => [...p, { key: keyRef.current++, fromRowId: fromOptions[0]?.value ?? UNPLACED, toRowId: "", quantity: "" }])}>
                    <Plus className="w-3 h-3 mr-1" /> Thêm dòng
                  </Button>
                )}
                <p className="text-xs text-text-muted">Bỏ trống dãy đích + số cây nếu chỉ đổi NV phụ trách. Sắp xếp không thay đổi tồn kho.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Huỷ</Button>
              <Button onClick={savePlace} disabled={busy}>
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Duyệt sắp xếp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
