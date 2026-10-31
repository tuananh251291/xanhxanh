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
import { Boxes, Loader2, ArrowRightLeft, ShoppingCart, Truck, XCircle, History } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Pool = "CONTAMINATED" | "PLANNED" | "FINISHED" | "LIQUIDATION";
const POOLS: Pool[] = ["CONTAMINATED", "PLANNED", "FINISHED", "LIQUIDATION"];
const POOL_LABELS: Record<Pool, string> = { CONTAMINATED: "Kho nhiễm", PLANNED: "Kho cây trồng", FINISHED: "Kho thành phẩm", LIQUIDATION: "Kho thanh lý" };
const ALLOCATABLE: Pool[] = ["FINISHED", "LIQUIDATION"];
const LOG_LABELS: Record<string, string> = {
  RECEIVE: "Nhận vào lô (sau NV3)", PLACE: "Sắp xếp vị trí", DAMAGE: "Cây hỏng", SIZE_S: "Đạt size S", MOVE: "Điều phối",
  FINISHED_DAMAGE: "Cây thành phẩm hỏng", TO_LIQUIDATION: "Chuyển Kho thanh lý",
  PACK: "Đóng gói", ALLOCATE: "Phân bổ đơn hàng", CANCEL_ALLOCATION: "Huỷ phân bổ", SHIP: "Xuất kho",
};
const NONE = "__none__";
const fmt = (n: number) => n.toLocaleString("vi-VN");

type Line = {
  id: string; pool: Pool; stageCode: string; quantity: number; reserved: number; lotCode: string | null; plantCode: string; plantName: string;
  rowId: string | null; rowLabel: string | null; staffId: string | null; staffName: string | null;
};
type Allocation = {
  id: string; status: "ACTIVE" | "DONE" | "CANCELLED"; pool: Pool; stageCode: string; quantity: number; shipped: number; cancelled: number; createdAt: string;
  orderCode: string; customerCode: string; orderStatus: string; saleName: string; plantCode: string; plantName: string; lotCode: string | null; rowLabel: string | null; createdBy: string;
  // Phân bổ theo phiếu giao vườn (Nghiệp vụ 7) — đóng gói/xuất kho thao tác ở trang Đóng gói đơn hàng.
  packCode: string | null; packed: number;
};
type Log = {
  id: string; type: string; lotCode: string | null; quantity: number; fromPool: Pool | null; toPool: Pool | null; fromStage: string | null; toStage: string | null;
  fromRow: string | null; toRow: string | null; fromStaff: string | null; toStaff: string | null; orderCode: string | null; note: string | null; at: string;
  plantCode: string; plantName: string; byName: string;
};

export default function GardenInventoryBoard({ gardens, gardenId, lines, pending, allocations, logs, rows, staff, orders, stageOptions }: {
  gardens: { id: string; code: string; name: string }[]; gardenId: string; lines: Line[];
  pending: { pool: string; stageCode: string; quantity: number; plantCode: string; plantName: string }[];
  allocations: Allocation[]; logs: Log[]; rows: { id: string; label: string }[]; staff: { id: string; name: string }[];
  orders: { id: string; label: string }[]; stageOptions: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Pool>("FINISHED");
  const [busy, setBusy] = useState(false);
  const [move, setMove] = useState<{ line: Line; qty: string; pool: Pool; stage: string; row: string; staff: string; note: string } | null>(null);
  const [alloc, setAlloc] = useState<{ line: Line; orderId: string | null; qty: string; note: string } | null>(null);
  const [ship, setShip] = useState<{ a: Allocation; qty: string } | null>(null);
  const [cancel, setCancel] = useState<{ a: Allocation; reason: string } | null>(null);

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

  const shown = lines.filter((l) => l.pool === tab);
  const totals = (p: Pool) => lines.filter((l) => l.pool === p).reduce((s, l) => ({ q: s.q + l.quantity, r: s.r + l.reserved }), { q: 0, r: 0 });
  const activeAllocations = allocations.filter((a) => a.status === "ACTIVE");

  const submitMove = () => {
    if (!move) return;
    const qty = Number(move.qty);
    const available = move.line.quantity - move.line.reserved;
    if (!Number.isInteger(qty) || qty <= 0 || qty > available) { toast.error(`Số lượng từ 1 đến ${fmt(available)} (khả dụng)`); return; }
    const body: Record<string, unknown> = { lineId: move.line.id, quantity: qty, note: move.note.trim() || undefined };
    if (move.pool !== move.line.pool) body.toPool = move.pool;
    if (move.stage !== move.line.stageCode) body.toStage = move.stage;
    const row = move.row === NONE ? null : move.row;
    if (row !== move.line.rowId) body.toRowId = row;
    const st = move.staff === NONE ? null : move.staff;
    if (st !== move.line.staffId) body.toStaffId = st;
    if (Object.keys(body).length === 3 && !body.note) { toast.error("Chưa thay đổi kho, size, vị trí hay NV"); return; }
    call("/api/garden-inventory/move", "POST", body, () => setMove(null));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Boxes className="w-6 h-6 text-primary-strong" /> Tồn kho & điều phối vườn</h1>
          <p className="text-text-secondary text-sm mt-1">Khả dụng = Tồn vật lý − Giữ chỗ (đã phân bổ đơn hàng, chưa xuất). Chỉ điều phối/phân bổ phần khả dụng; mọi thao tác lưu lịch sử.</p>
        </div>
        {gardens.length > 1 && (
          <Select items={gardens.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))} value={gardenId} onValueChange={(v) => router.push(`/garden-stock?garden=${v}`)}>
            <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
            <SelectContent>{gardens.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.code})</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {POOLS.map((p) => {
          const t = totals(p);
          return (
            <Button key={p} size="sm" variant={tab === p ? "default" : "outline"} onClick={() => setTab(p)}>
              {POOL_LABELS[p]} · {fmt(t.q)}{t.r > 0 ? ` (giữ ${fmt(t.r)})` : ""}
            </Button>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{POOL_LABELS[tab]} — {shown.length} dòng tồn</CardTitle></CardHeader>
        <CardContent className="p-0">
          {shown.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Kho trống</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    {["Mã cây", "Tên cây", "Mã lô", "Size", "Vị trí", "NV phụ trách"].map((h) => <th key={h} className="text-left px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                    {["Tồn vật lý", "Giữ chỗ", "Khả dụng"].map((h) => <th key={h} className="text-right px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => {
                    const available = l.quantity - l.reserved;
                    return (
                      <tr key={l.id} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                        <td className="px-3 py-2 font-mono text-text-secondary">{l.plantCode}</td>
                        <td className="px-3 py-2 text-foreground">{l.plantName}</td>
                        <td className="px-3 py-2 font-mono text-xs">{l.lotCode ?? "—"}</td>
                        <td className="px-3 py-2">{l.stageCode}</td>
                        <td className="px-3 py-2 font-mono">{l.rowLabel ?? <span className="text-text-muted">Chưa xếp</span>}</td>
                        <td className="px-3 py-2">{l.staffName ?? <span className="text-text-muted">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(l.quantity)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-warning-foreground">{l.reserved > 0 ? fmt(l.reserved) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(available)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7" disabled={busy || available <= 0}
                              onClick={() => setMove({ line: l, qty: String(available), pool: l.pool, stage: l.stageCode, row: l.rowId ?? NONE, staff: l.staffId ?? NONE, note: "" })}>
                              <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Điều phối
                            </Button>
                            {ALLOCATABLE.includes(l.pool) && (
                              <Button size="sm" variant="outline" className="h-7" disabled={busy || available <= 0} onClick={() => setAlloc({ line: l, orderId: null, qty: "", note: "" })}>
                                <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Phân bổ
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Chờ đóng gói — phân bổ đơn hàng Sale ({activeAllocations.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {allocations.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có phân bổ nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    {["Đơn hàng", "Mã cây / Lô", "Kho · Size · Vị trí"].map((h) => <th key={h} className="text-left px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                    {["Phân bổ", "Đã xuất", "Đã huỷ", "Còn chờ"].map((h) => <th key={h} className="text-right px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => {
                    const remaining = a.quantity - a.shipped - a.cancelled;
                    return (
                      <tr key={a.id} className="border-b border-divider last:border-0 even:bg-primary-light/30 align-top">
                        <td className="px-3 py-2">
                          <p className="font-mono">{a.orderCode}</p>
                          <p className="text-xs text-text-secondary">KH {a.customerCode} · {a.saleName}{a.orderStatus === "CANCELLED" ? " · đơn đã huỷ" : ""}</p>
                        </td>
                        <td className="px-3 py-2"><span className="font-mono text-text-secondary mr-1">{a.plantCode}</span>{a.plantName}<p className="text-xs font-mono text-text-muted">{a.lotCode ?? ""}</p></td>
                        <td className="px-3 py-2 text-xs">{POOL_LABELS[a.pool]} · {a.stageCode} · {a.rowLabel ?? "chưa xếp"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(a.quantity)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(a.shipped)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(a.cancelled)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{a.status === "ACTIVE" ? fmt(remaining) : <Badge variant={a.status === "DONE" ? "completed" : "overdue"}>{a.status === "DONE" ? "Xong" : "Đã huỷ"}</Badge>}</td>
                        <td className="px-3 py-2">
                          {a.status === "ACTIVE" && a.packCode && (
                            <a href="/garden-packing" className="text-xs text-info-foreground hover:underline whitespace-nowrap">Phiếu {a.packCode} · đã đóng gói {fmt(a.packed)} → Đóng gói đơn hàng</a>
                          )}
                          {a.status === "ACTIVE" && !a.packCode && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setShip({ a, qty: String(remaining) })}><Truck className="w-3.5 h-3.5 mr-1" /> Xuất kho</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-destructive hover:bg-danger-light" disabled={busy} onClick={() => setCancel({ a, reason: "" })}><XCircle className="w-3.5 h-3.5 mr-1" /> Huỷ</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Đã nhận, chờ phân loại cây hỏng (NV3) — chưa có lô</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {pending.map((p, i) => (
              <span key={i} className="rounded-md border border-divider px-2 py-1">
                {POOL_LABELS[p.pool as Pool]} · <span className="font-mono">{p.plantCode}</span> {p.plantName} ({p.stageCode}): <strong>{fmt(p.quantity)}</strong>
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Lịch sử điều phối, phân bổ, xuất kho</CardTitle></CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có thao tác nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    {["Thời gian", "Thao tác", "Mã cây / Lô", "Trước → Sau", "Số lượng", "Người thực hiện"].map((h) => <th key={h} className="text-left px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => {
                    const from = [l.fromPool && POOL_LABELS[l.fromPool], l.fromStage, l.fromRow, l.fromStaff].filter(Boolean).join(" · ");
                    const to = [l.toPool && POOL_LABELS[l.toPool], l.toStage, l.toRow, l.toStaff].filter(Boolean).join(" · ");
                    return (
                      <tr key={l.id} className="border-b border-divider last:border-0 even:bg-primary-light/30 align-top">
                        <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{format(new Date(l.at), "dd/MM/yyyy HH:mm")}</td>
                        <td className="px-3 py-2">{LOG_LABELS[l.type] ?? l.type}{l.orderCode && <p className="text-xs font-mono text-text-secondary">Đơn {l.orderCode}</p>}</td>
                        <td className="px-3 py-2"><span className="font-mono text-text-secondary mr-1">{l.plantCode}</span>{l.plantName}<p className="text-xs font-mono text-text-muted">{l.lotCode ?? ""}</p></td>
                        <td className="px-3 py-2 text-xs">{from || "—"}{to && <> → <span className="text-foreground">{to}</span></>}{l.note && <p className="text-text-muted">{l.note}</p>}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(l.quantity)}</td>
                        <td className="px-3 py-2 text-text-secondary">{l.byName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hướng A — điều phối */}
      <Dialog open={!!move} onOpenChange={(o) => { if (!o && !busy) setMove(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Điều phối cây</DialogTitle></DialogHeader>
          {move && (
            <div className="space-y-3 text-sm">
              <p className="rounded-lg bg-primary-light/40 p-2">
                <span className="font-mono">{move.line.plantCode}</span> {move.line.plantName} · lô {move.line.lotCode ?? "—"}<br />
                Hiện tại: {POOL_LABELS[move.line.pool]} · size {move.line.stageCode} · {move.line.rowLabel ?? "chưa xếp"} · {move.line.staffName ?? "chưa giao NV"} — khả dụng {fmt(move.line.quantity - move.line.reserved)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Số lượng</Label>
                  <Input type="number" min={1} value={move.qty} onChange={(e) => setMove({ ...move, qty: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Kho đích</Label>
                  <Select items={POOLS.map((p) => ({ value: p, label: POOL_LABELS[p] }))} value={move.pool} onValueChange={(v) => setMove({ ...move, pool: v as Pool })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{POOLS.map((p) => <SelectItem key={p} value={p}>{POOL_LABELS[p]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Size</Label>
                  <Select items={stageOptions.map((s) => ({ value: s, label: s }))} value={move.stage} onValueChange={(v) => setMove({ ...move, stage: v as string })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{stageOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Vị trí</Label>
                  <Select items={[{ value: NONE, label: "Chưa xếp" }, ...rows.map((r) => ({ value: r.id, label: r.label }))]} value={move.row} onValueChange={(v) => setMove({ ...move, row: v as string })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Chưa xếp</SelectItem>
                      {rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>NV phụ trách</Label>
                  <Select items={[{ value: NONE, label: "— Không giao —" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} value={move.staff} onValueChange={(v) => setMove({ ...move, staff: v as string })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Không giao —</SelectItem>
                      {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Ghi chú / lý do <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
                  <Input value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} maxLength={500} />
                </div>
              </div>
              <p className="rounded-lg bg-info-light text-info-foreground p-2">
                Sau: {POOL_LABELS[move.pool]} · size {move.stage} · {rows.find((r) => r.id === move.row)?.label ?? "chưa xếp"} · {staff.find((s) => s.id === move.staff)?.name ?? "chưa giao NV"} — {fmt(Number(move.qty) || 0)} cây
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMove(null)} disabled={busy}>Huỷ</Button>
            <Button onClick={submitMove} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Xác nhận điều phối</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hướng B — phân bổ đơn hàng */}
      <Dialog open={!!alloc} onOpenChange={(o) => { if (!o && !busy) setAlloc(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Phân bổ cho đơn hàng Sale</DialogTitle></DialogHeader>
          {alloc && (
            <div className="space-y-3 text-sm">
              <p className="rounded-lg bg-primary-light/40 p-2">
                <span className="font-mono">{alloc.line.plantCode}</span> {alloc.line.plantName} · lô {alloc.line.lotCode ?? "—"} · {POOL_LABELS[alloc.line.pool]} · size {alloc.line.stageCode} · {alloc.line.rowLabel ?? "chưa xếp"} — khả dụng {fmt(alloc.line.quantity - alloc.line.reserved)}
              </p>
              <div className="space-y-1">
                <Label>Đơn hàng</Label>
                <Select items={orders.map((o) => ({ value: o.id, label: o.label }))} value={alloc.orderId} onValueChange={(v) => setAlloc({ ...alloc, orderId: v as string })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Chọn đơn hàng đang giữ/đã xác nhận" /></SelectTrigger>
                  <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Số lượng phân bổ</Label>
                <Input type="number" min={1} value={alloc.qty} onChange={(e) => setAlloc({ ...alloc, qty: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Ghi chú <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
                <Input value={alloc.note} onChange={(e) => setAlloc({ ...alloc, note: e.target.value })} maxLength={500} />
              </div>
              <p className="text-xs text-text-muted">Phân bổ giữ chỗ (trừ khả dụng), chưa trừ tồn vật lý — chuyển sang Chờ đóng gói.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlloc(null)} disabled={busy}>Huỷ</Button>
            <Button disabled={busy} onClick={() => {
              if (!alloc) return;
              const qty = Number(alloc.qty);
              const available = alloc.line.quantity - alloc.line.reserved;
              if (!alloc.orderId) { toast.error("Chọn đơn hàng"); return; }
              if (!Number.isInteger(qty) || qty <= 0 || qty > available) { toast.error(`Số lượng từ 1 đến ${fmt(available)}`); return; }
              call("/api/garden-inventory/allocate", "POST", { lineId: alloc.line.id, orderId: alloc.orderId, quantity: qty, note: alloc.note.trim() || undefined }, () => setAlloc(null));
            }}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Phân bổ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ship} onOpenChange={(o) => { if (!o && !busy) setShip(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Xác nhận xuất kho</DialogTitle></DialogHeader>
          {ship && (
            <div className="space-y-2 text-sm">
              <p>Đơn <span className="font-mono">{ship.a.orderCode}</span> · {ship.a.plantCode} ({ship.a.stageCode}) — còn chờ {fmt(ship.a.quantity - ship.a.shipped - ship.a.cancelled)}</p>
              <Label>Số lượng xuất</Label>
              <Input type="number" min={1} value={ship.qty} onChange={(e) => setShip({ ...ship, qty: e.target.value })} />
              <p className="text-xs text-text-muted">Trừ tồn vật lý ngay, mỗi cây chỉ xuất 1 lần.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShip(null)} disabled={busy}>Huỷ</Button>
            <Button disabled={busy} onClick={() => ship && call(`/api/garden-inventory/allocations/${ship.a.id}`, "PATCH", { action: "ship", quantity: Number(ship.qty) }, () => setShip(null))}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Xuất kho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancel} onOpenChange={(o) => { if (!o && !busy) setCancel(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Huỷ phân bổ?</DialogTitle></DialogHeader>
          {cancel && (
            <div className="space-y-2 text-sm">
              <p>Giải phóng {fmt(cancel.a.quantity - cancel.a.shipped - cancel.a.cancelled)} cây chưa xuất của đơn <span className="font-mono">{cancel.a.orderCode}</span> về kho nguồn. Phần đã xuất không quay lại tồn.</p>
              <Label>Lý do <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
              <Input value={cancel.reason} onChange={(e) => setCancel({ ...cancel, reason: e.target.value })} maxLength={500} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancel(null)} disabled={busy}>Đóng</Button>
            <Button className="bg-destructive hover:bg-destructive/90 text-black" disabled={busy}
              onClick={() => cancel && call(`/api/garden-inventory/allocations/${cancel.a.id}`, "PATCH", { action: "cancel", reason: cancel.reason.trim() || undefined }, () => setCancel(null))}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Huỷ phân bổ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
