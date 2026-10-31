"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Boxes, Loader2, PackageCheck, PackageOpen, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Pool = "CONTAMINATED" | "PLANNED" | "FINISHED" | "LIQUIDATION";
const POOL_LABELS: Record<Pool, string> = { CONTAMINATED: "Kho nhiễm", PLANNED: "Kho cây trồng", FINISHED: "Kho thành phẩm", LIQUIDATION: "Kho thanh lý" };
type Allocation = {
  id: string; status: "ACTIVE" | "DONE" | "CANCELLED"; pool: Pool; quantity: number; cancelled: number; packed: number; shipped: number;
  lotCode: string | null; rowLabel: string | null; lineQuantity: number;
};
type Item = { id: string; plantTypeId: string; plantCode: string; plantName: string; stageCode: string; quantity: number; notes: string | null; allocations: Allocation[] };
type Req = {
  id: string; code: string; status: "SENT" | "DONE" | "CANCELLED"; notes: string | null; createdAt: string; doneAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  orderCode: string; customer: string; saleName: string; orderNotes: string | null; expectedShipAt: string | null;
  createdByName: string; packerId: string | null; packerName: string | null; items: Item[];
};
type Line = { id: string; pool: Pool; plantTypeId: string; stageCode: string; quantity: number; available: number; lotCode: string | null; rowLabel: string | null; staffName: string | null };

const NONE = "__none__";
const fmt = (n: number) => n.toLocaleString("vi-VN");
const allocatedOf = (it: Item) => it.allocations.reduce((s, a) => s + a.quantity - a.cancelled, 0);
const packedOf = (a: Allocation) => Math.max(a.shipped, Math.min(a.packed, a.quantity - a.cancelled));

export default function GardenPackingBoard({ gardens, gardenId, active, recent, lines, packers }: {
  gardens: { id: string; code: string; name: string }[]; gardenId: string; active: Req[]; recent: Req[]; lines: Line[]; packers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [alloc, setAlloc] = useState<{ req: Req; item: Item; lineId: string | null; qty: string } | null>(null);
  const [pack, setPack] = useState<{ a: Allocation; item: Item; qty: string } | null>(null);
  const [ship, setShip] = useState<{ a: Allocation; item: Item; qty: string } | null>(null);
  const [cancel, setCancel] = useState<{ a: Allocation; item: Item } | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  const call = async (url: string, method: "POST" | "PATCH", body: object, onDone: () => void) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(json.message);
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const candidates = alloc ? lines.filter((l) => l.plantTypeId === alloc.item.plantTypeId && l.stageCode === alloc.item.stageCode && l.available > 0) : [];
  const allocLeft = alloc ? alloc.item.quantity - allocatedOf(alloc.item) : 0;

  const renderRequest = (r: Req) => (
    <Card key={r.id}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="font-mono">{r.code}</span>
            <Badge variant={r.status === "SENT" ? "in-progress" : r.status === "DONE" ? "completed" : "overdue"}>{r.status === "SENT" ? "Đang đóng gói" : r.status === "DONE" ? "Đã xuất đủ" : "Đã huỷ"}</Badge>
          </CardTitle>
          <p className="text-sm text-text-secondary">
            Đơn <span className="font-mono">{r.orderCode}</span> · KH {r.customer} · NV bán hàng {r.saleName}
            {r.expectedShipAt ? ` · dự kiến xuất ${format(new Date(r.expectedShipAt), "HH:mm dd/MM/yyyy")}` : ""}
          </p>
          <p className="text-xs text-text-muted">NV Điều phối {r.createdByName} gửi {format(new Date(r.createdAt), "HH:mm dd/MM/yyyy")}
            {r.doneAt ? ` · xuất đủ ${format(new Date(r.doneAt), "HH:mm dd/MM/yyyy")}` : ""}
            {r.cancelledAt ? ` · huỷ ${format(new Date(r.cancelledAt), "HH:mm dd/MM/yyyy")}${r.cancelReason ? ` (${r.cancelReason})` : ""}` : ""}
          </p>
          {r.notes && <p className="text-sm">Ghi chú đóng gói: <span className="text-foreground">{r.notes}</span></p>}
          {r.orderNotes && <p className="text-xs text-text-secondary">Ghi chú đơn: {r.orderNotes}</p>}
        </div>
        <div className="space-y-1 min-w-56">
          <Label className="text-xs">NV đóng gói</Label>
          {r.status === "SENT" ? (
            <Select
              items={[{ value: NONE, label: "Chưa giao" }, ...packers.map((p) => ({ value: p.id, label: p.name }))]}
              value={r.packerId ?? NONE}
              onValueChange={(v) => call(`/api/garden-pack-requests/${r.id}`, "PATCH", { action: "assign", packerId: v === NONE ? null : v }, () => {})}
            >
              <SelectTrigger className="w-full" disabled={busy}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Chưa giao</SelectItem>
                {packers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : <p className="text-sm">{r.packerName ?? "—"}</p>}
          {r.status === "SENT" && packers.length === 0 && <p className="text-xs text-text-muted">Chưa có Nhân sự vườn loại Đóng hàng — thêm ở Nhân sự vườn.</p>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                {["Mã cây / Nguồn kho", "Size"].map((h) => <th key={h} className="text-left px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                {["Cần / Phân bổ", "Đã đóng gói", "Đã xuất", "Tồn nguồn còn"].map((h) => <th key={h} className="text-right px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {r.items.map((it) => {
                const allocated = allocatedOf(it);
                const packed = it.allocations.reduce((s, a) => s + packedOf(a), 0);
                const shipped = it.allocations.reduce((s, a) => s + a.shipped, 0);
                return [
                  <tr key={it.id} className="border-t border-border bg-primary-light/20 align-top">
                    <td className="px-3 py-2">
                      <span className="font-mono text-text-secondary mr-1">{it.plantCode}</span><strong>{it.plantName}</strong>
                      {it.notes && <p className="text-xs text-text-secondary">Ghi chú: {it.notes}</p>}
                    </td>
                    <td className="px-3 py-2">{it.stageCode}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <strong>{fmt(it.quantity)}</strong>
                      <p className={`text-xs ${allocated < it.quantity ? "text-warning-foreground" : "text-text-muted"}`}>đã phân bổ {fmt(allocated)}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(packed)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(shipped)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right">
                      {r.status === "SENT" && allocated < it.quantity && (
                        <Button size="sm" className="h-7" disabled={busy} onClick={() => setAlloc({ req: r, item: it, lineId: null, qty: "" })}>
                          <Boxes className="w-3.5 h-3.5 mr-1" /> Phân bổ
                        </Button>
                      )}
                    </td>
                  </tr>,
                  ...it.allocations.filter((a) => a.quantity - a.cancelled > 0 || a.status === "ACTIVE").map((a) => {
                    const toShip = packedOf(a) - a.shipped;
                    return (
                      <tr key={a.id} className="border-b border-divider text-text-secondary">
                        <td className="px-3 py-1.5 pl-8 text-xs">
                          ↳ {POOL_LABELS[a.pool]} · lô {a.lotCode ?? "—"} · {a.rowLabel ?? "chưa xếp"}
                          {a.status !== "ACTIVE" && <Badge variant={a.status === "DONE" ? "completed" : "overdue"} className="ml-2">{a.status === "DONE" ? "Xong" : "Đã huỷ"}</Badge>}
                        </td>
                        <td />
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs">{fmt(a.quantity - a.cancelled)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs">{fmt(packedOf(a))}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs">{fmt(a.shipped)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs">{fmt(a.lineQuantity)}</td>
                        <td className="px-3 py-1.5">
                          {a.status === "ACTIVE" && r.status === "SENT" && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setPack({ a, item: it, qty: String(a.quantity - a.cancelled) })}>
                                <PackageCheck className="w-3.5 h-3.5 mr-1" /> Đã đóng gói
                              </Button>
                              <Button size="sm" variant="outline" className="h-7" disabled={busy || toShip <= 0} onClick={() => setShip({ a, item: it, qty: String(toShip) })}>
                                <Truck className="w-3.5 h-3.5 mr-1" /> Xuất kho
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-destructive hover:bg-danger-light" disabled={busy} onClick={() => setCancel({ a, item: it })} aria-label="Huỷ phân bổ">
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><PackageOpen className="w-6 h-6 text-primary-strong" /> Đóng gói đơn hàng</h1>
          <p className="text-text-secondary text-sm mt-1">Phiếu giao vườn từ NV Điều phối: phân bổ cây từ Kho thành phẩm/Kho thanh lý, giao NV đóng gói, ghi nhận số đã đóng gói, xác nhận xuất kho (lúc này mới trừ tồn, tối đa số đã đóng gói).</p>
        </div>
        {gardens.length > 1 && (
          <Select items={gardens.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))} value={gardenId} onValueChange={(v) => router.push(`/garden-packing?garden=${v}`)}>
            <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
            <SelectContent>{gardens.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.code})</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {active.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">Không có phiếu giao vườn nào đang chờ đóng gói</CardContent></Card>
      ) : active.map(renderRequest)}

      {recent.length > 0 && (
        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setShowRecent((v) => !v)}>{showRecent ? "Ẩn" : "Xem"} phiếu đã xuất đủ / đã huỷ gần đây ({recent.length})</Button>
          {showRecent && recent.map(renderRequest)}
        </div>
      )}

      {/* Phân bổ cho 1 dòng phiếu */}
      <Dialog open={!!alloc} onOpenChange={(o) => { if (!o && !busy) setAlloc(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Phân bổ cây cho phiếu {alloc?.req.code}</DialogTitle></DialogHeader>
          {alloc && (
            <div className="space-y-3 text-sm">
              <p className="rounded-lg bg-primary-light/40 p-2">
                <span className="font-mono">{alloc.item.plantCode}</span> {alloc.item.plantName} · size {alloc.item.stageCode} — còn cần phân bổ <strong>{fmt(allocLeft)}</strong> cây
              </p>
              {candidates.length === 0 ? (
                <p className="text-destructive">Không còn dòng tồn khả dụng đúng mã cây + size ở Kho thành phẩm/Kho thanh lý.</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {candidates.map((l) => (
                    <label key={l.id} className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer ${alloc.lineId === l.id ? "border-primary bg-primary-light/40" : "border-divider"}`}>
                      <input type="radio" name="line" checked={alloc.lineId === l.id} onChange={() => setAlloc({ ...alloc, lineId: l.id, qty: alloc.qty || String(Math.min(allocLeft, l.available)) })} />
                      <span className="flex-1">{POOL_LABELS[l.pool]} · lô {l.lotCode ?? "—"} · {l.rowLabel ?? "chưa xếp"}{l.staffName ? ` · ${l.staffName}` : ""}</span>
                      <span className="tabular-nums text-text-secondary">khả dụng <strong className="text-foreground">{fmt(l.available)}</strong> / tồn {fmt(l.quantity)}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                <Label>Số lượng phân bổ</Label>
                <Input type="number" min={1} value={alloc.qty} onChange={(e) => setAlloc({ ...alloc, qty: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setAlloc(null)}>Đóng</Button>
            <Button disabled={busy || !alloc?.lineId} onClick={() => {
              if (!alloc?.lineId) return;
              const q = Number(alloc.qty);
              const line = candidates.find((l) => l.id === alloc.lineId);
              const max = Math.min(allocLeft, line?.available ?? 0);
              if (!Number.isInteger(q) || q <= 0 || q > max) { toast.error(`Số lượng từ 1 đến ${fmt(max)}`); return; }
              call(`/api/garden-pack-requests/items/${alloc.item.id}/allocate`, "POST", { lineId: alloc.lineId, quantity: q }, () => setAlloc(null));
            }}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Phân bổ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ghi nhận đã đóng gói */}
      <Dialog open={!!pack} onOpenChange={(o) => { if (!o && !busy) setPack(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Ghi nhận đã đóng gói</DialogTitle></DialogHeader>
          {pack && (
            <div className="space-y-3 text-sm">
              <p className="rounded-lg bg-primary-light/40 p-2">
                <span className="font-mono">{pack.item.plantCode}</span> {pack.item.plantName} · size {pack.item.stageCode} · {POOL_LABELS[pack.a.pool]} · {pack.a.rowLabel ?? "chưa xếp"}<br />
                Phân bổ {fmt(pack.a.quantity - pack.a.cancelled)} · đã đóng gói {fmt(packedOf(pack.a))} · đã xuất {fmt(pack.a.shipped)}
              </p>
              <div className="space-y-1">
                <Label>Tổng số đã đóng gói</Label>
                <Input type="number" min={pack.a.shipped} max={pack.a.quantity - pack.a.cancelled} value={pack.qty} onChange={(e) => setPack({ ...pack, qty: e.target.value })} />
                <p className="text-xs text-text-muted">Nhập tổng (không phải số đóng thêm), từ {fmt(pack.a.shipped)} đến {fmt(pack.a.quantity - pack.a.cancelled)}. Chưa trừ tồn.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPack(null)}>Đóng</Button>
            <Button disabled={busy} onClick={() => pack && call(`/api/garden-inventory/allocations/${pack.a.id}`, "PATCH", { action: "pack", packedQuantity: Number(pack.qty) }, () => setPack(null))}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Xác nhận xuất kho */}
      <Dialog open={!!ship} onOpenChange={(o) => { if (!o && !busy) setShip(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Xác nhận xuất kho</DialogTitle></DialogHeader>
          {ship && (
            <div className="space-y-3 text-sm">
              <p className="rounded-lg bg-primary-light/40 p-2">
                <span className="font-mono">{ship.item.plantCode}</span> {ship.item.plantName} · size {ship.item.stageCode} · {POOL_LABELS[ship.a.pool]} · {ship.a.rowLabel ?? "chưa xếp"}<br />
                Đã đóng gói chờ xuất <strong>{fmt(packedOf(ship.a) - ship.a.shipped)}</strong> · tồn nguồn hiện {fmt(ship.a.lineQuantity)}
              </p>
              <div className="space-y-1">
                <Label>Số lượng xuất thực tế</Label>
                <Input type="number" min={1} max={packedOf(ship.a) - ship.a.shipped} value={ship.qty} onChange={(e) => setShip({ ...ship, qty: e.target.value })} />
                <p className="text-xs text-text-muted">Xác nhận xong trừ ngay tồn vật lý của {POOL_LABELS[ship.a.pool]}.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setShip(null)}>Đóng</Button>
            <Button disabled={busy} onClick={() => {
              if (!ship) return;
              const q = Number(ship.qty);
              const max = packedOf(ship.a) - ship.a.shipped;
              if (!Number.isInteger(q) || q <= 0 || q > max) { toast.error(`Số lượng từ 1 đến ${fmt(max)}`); return; }
              call(`/api/garden-inventory/allocations/${ship.a.id}`, "PATCH", { action: "ship", quantity: q }, () => setShip(null));
            }}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Xác nhận xuất kho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Huỷ phân bổ */}
      <Dialog open={!!cancel} onOpenChange={(o) => { if (!o && !busy) setCancel(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Huỷ phân bổ</DialogTitle></DialogHeader>
          {cancel && (
            <p className="text-sm text-text-secondary">
              Giải phóng {fmt(cancel.a.quantity - cancel.a.cancelled - cancel.a.shipped)} cây chưa xuất ({cancel.item.plantCode} size {cancel.item.stageCode}) về {POOL_LABELS[cancel.a.pool]}. Phần đã xuất giữ nguyên; dòng phiếu sẽ cần phân bổ lại.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setCancel(null)}>Đóng</Button>
            <Button variant="destructive" disabled={busy} onClick={() => cancel && call(`/api/garden-inventory/allocations/${cancel.a.id}`, "PATCH", { action: "cancel", reason: "QLV huỷ phân bổ (đóng gói)" }, () => setCancel(null))}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Huỷ phân bổ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
