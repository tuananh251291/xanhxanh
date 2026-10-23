"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, LayoutGrid, Warehouse, X } from "lucide-react";
import { toast } from "sonner";

type Garden = { id: string; code: string; name: string };
type Row = { id: string; number: number };
type Rack = { id: string; letter: string; rows: Row[] };
type House = { id: string; number: number; racks: Rack[] };
type Pending = { type: "house" | "rack" | "row"; id: string; label: string; warning?: string };

export default function GardenLayoutBoard({ gardens }: { gardens: Garden[] }) {
  const [gardenId, setGardenId] = useState(gardens[0].id);
  const [houses, setHouses] = useState<House[]>([]);
  // Đang tải = sơ đồ hiện có chưa phải của đúng vườn + lần tải mới nhất (đổi vườn hoặc vừa thêm/xoá).
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== `${gardenId}:${reloadKey}`;
  const [busy, setBusy] = useState(false);
  const [rowCounts, setRowCounts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = `${gardenId}:${reloadKey}`;
    fetch(`/api/garden-layout?gardenId=${gardenId}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) { setHouses(Array.isArray(data) ? data : []); setLoadedKey(key); } })
      .catch(() => { if (!cancelled) setLoadedKey(key); });
    return () => { cancelled = true; };
  }, [gardenId, reloadKey]);
  const reload = () => setReloadKey((k) => k + 1);

  const call = async (method: "POST" | "DELETE", body: object) => {
    setBusy(true);
    try {
      const res = await fetch("/api/garden-layout", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return false; }
      toast.success(json.message);
      reload();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const addRows = async (rackId: string) => {
    const count = Number(rowCounts[rackId] || "1");
    if (!Number.isInteger(count) || count < 1 || count > 50) { toast.error("Số dãy thêm mỗi lần từ 1 đến 50"); return; }
    if (await call("POST", { action: "addRows", rackId, count })) setRowCounts((p) => ({ ...p, [rackId]: "" }));
  };

  const confirmDelete = async () => {
    if (!pending) return;
    if (await call("DELETE", { type: pending.type, id: pending.id })) setPending(null);
  };

  const totalRacks = houses.reduce((s, h) => s + h.racks.length, 0);
  const totalRows = houses.reduce((s, h) => s + h.racks.reduce((r, k) => r + k.rows.length, 0), 0);
  const lastHouse = houses[houses.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-primary-strong" /> Bố trí vườn
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Nhà lưới (1, 2, 3…) → Giàn kệ (A, B, C…) → Dãy (1, 2, 3…). Mã vị trí VD <strong>1A1</strong> = nhà lưới 1, giàn A, dãy 1.
          </p>
        </div>
        <Button disabled={busy} onClick={() => call("POST", { action: "addHouse", gardenId })}>
          <Plus className="w-4 h-4 mr-1.5" /> Thêm nhà lưới {lastHouse ? lastHouse.number + 1 : 1}
        </Button>
      </div>

      {gardens.length > 1 && (
        <Select items={gardens.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))} value={gardenId} onValueChange={(v) => setGardenId(v as string)}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            {gardens.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.code})</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
      ) : houses.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-10">Chưa có nhà lưới nào — bấm &quot;Thêm nhà lưới 1&quot;</p>
      ) : (
        <>
          <p className="text-sm text-text-secondary">{houses.length} nhà lưới · {totalRacks} giàn · {totalRows} dãy</p>
          {houses.map((h) => {
            const lastRack = h.racks[h.racks.length - 1];
            const nextLetter = lastRack ? String.fromCharCode(lastRack.letter.charCodeAt(0) + 1) : "A";
            return (
              <Card key={h.id}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2"><Warehouse className="w-4 h-4" /> Nhà lưới {h.number}</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busy || h.racks.length >= 26} onClick={() => call("POST", { action: "addRack", houseId: h.id })}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Thêm giàn {h.number}{nextLetter}
                    </Button>
                    {h.id === lastHouse.id && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:bg-danger-light" disabled={busy}
                        onClick={() => setPending({ type: "house", id: h.id, label: `Nhà lưới ${h.number}`, warning: h.racks.length > 0 ? `Xoá luôn ${h.racks.length} giàn và mọi dãy bên trong.` : undefined })}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Xoá
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {h.racks.length === 0 ? (
                    <p className="text-sm text-text-muted">Chưa có giàn nào</p>
                  ) : h.racks.map((r) => {
                    const prefix = `${h.number}${r.letter}`;
                    return (
                      <div key={r.id} className="rounded-lg border border-divider p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-primary-strong">Giàn {prefix} <span className="font-normal text-text-muted text-sm">({r.rows.length} dãy)</span></p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              type="number" min={1} max={50} className="h-8 w-20 text-xs" placeholder="Số dãy"
                              value={rowCounts[r.id] ?? ""}
                              onChange={(e) => setRowCounts((p) => ({ ...p, [r.id]: e.target.value }))}
                            />
                            <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => addRows(r.id)}>
                              <Plus className="w-3.5 h-3.5 mr-1" /> Thêm dãy
                            </Button>
                            {r.id === lastRack.id && (
                              <Button size="sm" variant="ghost" className="h-8 text-destructive hover:bg-danger-light" disabled={busy}
                                onClick={() => setPending({ type: "rack", id: r.id, label: `Giàn ${prefix}`, warning: r.rows.length > 0 ? `Xoá luôn ${r.rows.length} dãy bên trong.` : undefined })}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {r.rows.length === 0 ? (
                          <p className="text-xs text-text-muted">Chưa có dãy — nhập số dãy rồi bấm Thêm dãy (để trống = thêm 1 dãy)</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {r.rows.map((row, i) => (
                              <span key={row.id} className="inline-flex items-center gap-1 rounded-md bg-primary-light text-primary-strong font-mono text-xs px-2 py-1">
                                {prefix}{row.number}
                                {i === r.rows.length - 1 && (
                                  <button type="button" aria-label="Xoá dãy cuối" disabled={busy} className="hover:text-destructive"
                                    onClick={() => setPending({ type: "row", id: row.id, label: `Dãy ${prefix}${row.number}` })}>
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) setPending(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Xoá {pending?.label}?</DialogTitle></DialogHeader>
          {pending?.warning && <p className="text-sm text-destructive">{pending.warning}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>Huỷ</Button>
            <Button className="bg-destructive hover:bg-destructive/90 text-black" onClick={confirmDelete} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
