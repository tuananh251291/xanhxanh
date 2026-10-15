"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Send, Loader2, TriangleAlert, Trash2, Sprout, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type DestroyGroup = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; total: number; sources: string[] };
type StockGroup = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number };
type Option = { id: string; code: string; name: string };

const OUTPUT_STAGE_CODES = ["T01", "T05", "T10"] as const;
const keyOf = (g: { plantTypeId: string; stageCode: string }) => `${g.plantTypeId}:${g.stageCode}`;
const toInt = (v: string | undefined) => Math.max(0, parseInt(v ?? "", 10) || 0);
const fmt = (n: number) => n.toLocaleString("vi-VN");

export default function QlkDeXuatForm({
  taskId, taskCode, taskTitle, deadlineLabel, hasProcessingRoom, destroyGroups, processingStock, gardens, productionWarehouses,
}: {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  deadlineLabel: string | null;
  hasProcessingRoom: boolean;
  destroyGroups: DestroyGroup[];
  processingStock: StockGroup[];
  gardens: Option[];
  productionWarehouses: Option[];
}) {
  const router = useRouter();
  // Số hủy chốt — mặc định = tổng NV đề xuất.
  const [destroy, setDestroy] = useState<Record<string, string>>(() => Object.fromEntries(destroyGroups.map((g) => [keyOf(g), String(g.total)])));
  const [plant, setPlant] = useState<Record<string, string>>({});
  const [processQty, setProcessQty] = useState<Record<string, string>>({});
  const [outputStage, setOutputStage] = useState<Record<string, string>>({});
  const [gardenId, setGardenId] = useState<string | null>(null);
  const [productionWarehouseId, setProductionWarehouseId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Phần hủy Quản lý giảm bớt sẽ cộng vào Phòng chờ xử lý lúc gửi — tính luôn vào "Tồn phòng chờ xử lý" để
  // dùng được ngay cho Đề xuất trồng/Phiếu xử lý trong cùng lần gửi.
  const reductionByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of destroyGroups) m.set(keyOf(g), Math.max(0, g.total - Math.min(g.total, toInt(destroy[keyOf(g)]))));
    return m;
  }, [destroyGroups, destroy]);

  const stockRows = useMemo(() => {
    const m = new Map<string, StockGroup>();
    for (const s of processingStock) m.set(keyOf(s), { ...s });
    for (const g of destroyGroups) {
      const k = keyOf(g);
      const add = reductionByKey.get(k) ?? 0;
      if (add <= 0) continue;
      const row = m.get(k) ?? { plantTypeId: g.plantTypeId, plantTypeCode: g.plantTypeCode, plantTypeName: g.plantTypeName, stageCode: g.stageCode, quantity: 0 };
      m.set(k, { ...row, quantity: row.quantity + add });
    }
    return [...m.values()].sort((a, b) => (a.plantTypeCode === b.plantTypeCode ? a.stageCode.localeCompare(b.stageCode) : a.plantTypeCode.localeCompare(b.plantTypeCode)));
  }, [processingStock, destroyGroups, reductionByKey]);

  const destroyCount = destroyGroups.filter((g) => toInt(destroy[keyOf(g)]) > 0).length;
  const plantRows = stockRows.filter((r) => toInt(plant[keyOf(r)]) > 0);
  const processRows = stockRows.filter((r) => toInt(processQty[keyOf(r)]) > 0);
  const totalDestroy = destroyGroups.reduce((s, g) => s + Math.min(g.total, toInt(destroy[keyOf(g)])), 0);
  const totalPlant = plantRows.reduce((s, r) => s + toInt(plant[keyOf(r)]), 0);
  const totalProcess = processRows.reduce((s, r) => s + toInt(processQty[keyOf(r)]), 0);

  const validate = () => {
    for (const g of destroyGroups) {
      if (toInt(destroy[keyOf(g)]) > g.total) { toast.error(`${g.plantTypeCode} ${g.stageCode}: số hủy không được lớn hơn tổng NV đề xuất`); return false; }
    }
    for (const r of stockRows) {
      const k = keyOf(r);
      if (toInt(plant[k]) + toInt(processQty[k]) > r.quantity) { toast.error(`${r.plantTypeCode} ${r.stageCode}: trồng + xử lý vượt tồn Phòng chờ xử lý`); return false; }
    }
    if (plantRows.length > 0 && !gardenId) { toast.error("Chọn Vườn sản xuất cho Đề xuất trồng"); return false; }
    if (processRows.length > 0 && !productionWarehouseId) { toast.error("Chọn khu sản xuất cho Phiếu xử lý"); return false; }
    return true;
  };

  const send = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finished-goods-weekly/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destroy: destroyGroups.map((g) => ({ plantTypeId: g.plantTypeId, stageCode: g.stageCode, quantity: Math.min(g.total, toInt(destroy[keyOf(g)])) })),
          plant: plantRows.map((r) => ({ plantTypeId: r.plantTypeId, stageCode: r.stageCode, quantity: toInt(plant[keyOf(r)]) })),
          productionGardenId: plantRows.length > 0 ? gardenId ?? undefined : undefined,
          process: processRows.map((r) => ({
            plantTypeId: r.plantTypeId, stageCode: r.stageCode, quantity: toInt(processQty[keyOf(r)]),
            outputStageCode: outputStage[keyOf(r)] ?? defaultOutputStage(r.stageCode),
          })),
          productionWarehouseId: processRows.length > 0 ? productionWarehouseId ?? undefined : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Gửi thất bại"); return; }
      toast.success(`Đã gửi: ${json.huy} dòng hủy, ${json.trong} dòng trồng (chờ Admin cấp cao duyệt), ${json.xuLy} phiếu xử lý`);
      router.push("/task-assignment");
      router.refresh();
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/task-assignment">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{taskTitle}</h1>
          <p className="text-text-secondary text-sm">
            <span className="font-mono">{taskCode}</span>
            {deadlineLabel && <span className="text-warning-foreground font-medium"> · {deadlineLabel}</span>}
          </p>
        </div>
      </div>

      {!hasProcessingRoom && (
        <p className="text-sm text-destructive bg-danger-light rounded-lg p-3 flex items-center gap-2">
          <TriangleAlert className="w-4 h-4 shrink-0" /> Kho chưa có Phòng chờ xử lý — liên hệ Admin trước khi gửi.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Trash2 className="w-4 h-4" /> 1. Đề xuất hủy (gộp từ phiếu kiểm tra của NV)</CardTitle>
          <p className="text-xs text-text-secondary">Có thể giảm số lượng hủy — phần giảm sẽ được cộng vào Phòng chờ xử lý. Gửi Admin cấp cao duyệt.</p>
        </CardHeader>
        <CardContent>
          {destroyGroups.length === 0 ? (
            <p className="text-sm text-text-muted py-2">Chưa có dòng hủy nào từ phiếu kiểm tra của NV đang chờ gộp.</p>
          ) : (
            <div className="border border-divider rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tên cây</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">NV đề xuất</th>
                    <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Tổng NV đề xuất</th>
                    <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">Số hủy chốt</th>
                    <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Về Phòng chờ xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  {destroyGroups.map((g) => {
                    const k = keyOf(g);
                    return (
                      <tr key={k} className="border-t border-divider even:bg-primary-light/30 align-top">
                        <td className="px-3 py-2 font-mono text-xs text-text-secondary">{g.plantTypeCode}</td>
                        <td className="px-3 py-2 text-foreground">{g.plantTypeName}</td>
                        <td className="px-3 py-2 text-text-secondary">{g.stageCode}</td>
                        <td className="px-3 py-2 text-xs text-text-secondary">{g.sources.join(", ")}</td>
                        <td className="px-3 py-2 text-right text-text-secondary">{fmt(g.total)}</td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} max={g.total} className="h-9 text-right" value={destroy[k] ?? ""}
                            onChange={(e) => setDestroy((p) => ({ ...p, [k]: e.target.value }))} />
                        </td>
                        <td className="px-3 py-2 text-right text-foreground">{fmt(reductionByKey.get(k) ?? 0)}</td>
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
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Sprout className="w-4 h-4" /> 2. Đề xuất trồng / Phiếu xử lý (từ Phòng chờ xử lý)</CardTitle>
          <p className="text-xs text-text-secondary">
            Đề xuất trồng gửi Admin cấp cao duyệt — duyệt xong tự tạo phiếu bàn giao về Vườn sản xuất. Phiếu xử lý không cần duyệt — chuyển
            sang khu sản xuất thành chỉ định xử lý, xử lý xong Kho mô bàn giao lại Kho thành phẩm.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {stockRows.length === 0 ? (
            <p className="text-sm text-text-muted py-2">Phòng chờ xử lý đang trống.</p>
          ) : (
            <div className="border border-divider rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tên cây</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                    <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Tồn phòng chờ xử lý</th>
                    <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">Đề xuất trồng</th>
                    <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">Phiếu xử lý</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold w-28">Quy cách sau xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((r) => {
                    const k = keyOf(r);
                    const over = toInt(plant[k]) + toInt(processQty[k]) > r.quantity;
                    return (
                      <tr key={k} className="border-t border-divider even:bg-primary-light/30 align-top">
                        <td className="px-3 py-2 font-mono text-xs text-text-secondary">{r.plantTypeCode}</td>
                        <td className="px-3 py-2 text-foreground">{r.plantTypeName}</td>
                        <td className="px-3 py-2 text-text-secondary">{r.stageCode}</td>
                        <td className={`px-3 py-2 text-right ${over ? "text-destructive font-medium" : "text-text-secondary"}`}>{fmt(r.quantity)}</td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} max={r.quantity} className="h-9 text-right" value={plant[k] ?? ""}
                            onChange={(e) => setPlant((p) => ({ ...p, [k]: e.target.value }))} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} max={r.quantity} className="h-9 text-right" value={processQty[k] ?? ""}
                            onChange={(e) => setProcessQty((p) => ({ ...p, [k]: e.target.value }))} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            items={OUTPUT_STAGE_CODES.map((c) => ({ value: c, label: c }))}
                            value={outputStage[k] ?? defaultOutputStage(r.stageCode)}
                            onValueChange={(v) => setOutputStage((p) => ({ ...p, [k]: v as string }))}
                          >
                            <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {OUTPUT_STAGE_CODES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Vườn sản xuất <span className="text-text-muted font-normal">(cho Đề xuất trồng)</span></Label>
              <Select items={gardens.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))} value={gardenId} onValueChange={(v) => setGardenId(v as string)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn vườn" /></SelectTrigger>
                <SelectContent>
                  {gardens.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Khu sản xuất <span className="text-text-muted font-normal">(cho Phiếu xử lý)</span></Label>
              <Select items={productionWarehouses.map((w) => ({ value: w.id, label: w.name }))} value={productionWarehouseId} onValueChange={(v) => setProductionWarehouseId(v as string)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn khu sản xuất" /></SelectTrigger>
                <SelectContent>
                  {productionWarehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="space-y-1">
            <Label>Ghi chú <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ghi chú gửi kèm đề xuất" />
          </div>
          <Button className="w-full bg-primary hover:bg-primary-hover" disabled={submitting || !hasProcessingRoom} onClick={() => { if (validate()) setConfirmOpen(true); }}>
            <Send className="w-4 h-4 mr-2" /> Gửi đề xuất tuần
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!submitting) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Xác nhận gửi đề xuất tuần</DialogTitle></DialogHeader>
          <ul className="text-sm text-foreground space-y-1.5">
            <li className="flex items-center gap-2"><Trash2 className="w-4 h-4 text-text-muted" /> Đề xuất hủy: {destroyCount} dòng — {fmt(totalDestroy)} cây</li>
            <li className="flex items-center gap-2"><Sprout className="w-4 h-4 text-text-muted" /> Đề xuất trồng: {plantRows.length} dòng — {fmt(totalPlant)} cây</li>
            <li className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-text-muted" /> Phiếu xử lý: {processRows.length} phiếu — {fmt(totalProcess)} cây</li>
          </ul>
          <div className="flex items-start gap-2 text-sm font-medium text-warning-foreground bg-warning-light rounded-lg p-3">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            Kiểm tra lại: đây là số cây, không phải số túi. Gửi xong nhiệm vụ tuần sẽ hoàn thành.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>Kiểm tra lại</Button>
            <Button className="bg-primary hover:bg-primary-hover" onClick={send} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function defaultOutputStage(stageCode: string): string {
  return (OUTPUT_STAGE_CODES as readonly string[]).includes(stageCode) ? stageCode : "T01";
}
