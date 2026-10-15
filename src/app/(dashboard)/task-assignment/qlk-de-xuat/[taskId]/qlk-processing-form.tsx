"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { ArrowLeft, Plus, Trash2, Loader2, TriangleAlert, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { FINISHED_SPEC_LABELS, FINISHED_SPEC_BAG_SIZE } from "@/types";

type StockGroup = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number };
type Option = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };
type Row = { key: number; comboKey: string; quantity: string; outputStageCode: string };

const OUTPUT_STAGE_CODES = Object.keys(FINISHED_SPEC_LABELS) as (keyof typeof FINISHED_SPEC_LABELS)[];
const stageLabel = (code: string) => FINISHED_SPEC_LABELS[code as keyof typeof FINISHED_SPEC_LABELS] ?? code;
const bagSizeOf = (code: string) => FINISHED_SPEC_BAG_SIZE[code as keyof typeof FINISHED_SPEC_BAG_SIZE] ?? 1;
const keyOf = (g: { plantTypeId: string; stageCode: string }) => `${g.plantTypeId}:${g.stageCode}`;
const fmt = (n: number) => n.toLocaleString("vi-VN");
const emptyRow = (key: number): Row => ({ key, comboKey: "", quantity: "", outputStageCode: "" });

// Việc tuần "Phiếu xử lý" của Quản lý kho thành phẩm — giao diện giống "Tạo chỉ định cấy xử lý" của Kỹ
// thuật (create-repack-instruction-dialog.tsx) nhưng đầu vào là Phòng chờ xử lý (không theo kệ): mỗi dòng
// = 1 mã cây + quy cách → 1 chỉ định xử lý ở khu sản xuất đã chọn. Xem POST /api/finished-goods-weekly/[taskId].
export default function QlkProcessingForm({
  taskId, taskCode, taskTitle, deadlineLabel, hasProcessingRoom, processingStock, productionWarehouses,
}: {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  deadlineLabel: string | null;
  hasProcessingRoom: boolean;
  processingStock: StockGroup[];
  productionWarehouses: Option[];
}) {
  const router = useRouter();
  const rowKeyRef = useRef(1);
  const [rows, setRows] = useState<Row[]>([emptyRow(0)]);
  const [productionWarehouseId, setProductionWarehouseId] = useState<string | null>(productionWarehouses.length === 1 ? productionWarehouses[0].id : null);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stockByKey = useMemo(() => new Map(processingStock.map((s) => [keyOf(s), s])), [processingStock]);
  const comboOptions: ComboOption[] = useMemo(
    () => processingStock.map((s) => ({ value: keyOf(s), label: `${s.plantTypeCode} ${s.plantTypeName} — ${stageLabel(s.stageCode)} (${fmt(s.quantity)} cây)` })),
    [processingStock]
  );

  const updateRow = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(rowKeyRef.current)]);
    rowKeyRef.current += 1;
  };
  const removeRow = (key: number) => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));

  const filledRows = rows.filter((r) => r.comboKey || r.quantity);
  const totalQty = filledRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  const validate = () => {
    const usedByKey = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.comboKey && !row.quantity) continue;
      const stock = stockByKey.get(row.comboKey);
      if (!stock) { toast.error(`Dòng ${i + 1}: chọn mã cây + quy cách`); return false; }
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) { toast.error(`Dòng ${i + 1}: nhập số lượng lấy ra`); return false; }
      if (!row.outputStageCode) { toast.error(`Dòng ${i + 1}: chọn quy cách đầu ra`); return false; }
      usedByKey.set(row.comboKey, (usedByKey.get(row.comboKey) ?? 0) + qty);
    }
    for (const [k, used] of usedByKey) {
      const stock = stockByKey.get(k)!;
      if (used > stock.quantity) {
        toast.error(`${stock.plantTypeCode} ${stock.stageCode}: tổng số lấy ra vượt tồn Phòng chờ xử lý (còn ${fmt(stock.quantity)} cây)`);
        return false;
      }
    }
    if (usedByKey.size > 0 && !productionWarehouseId) { toast.error("Chọn khu sản xuất nhận phiếu xử lý"); return false; }
    return true;
  };

  const send = async () => {
    setSubmitting(true);
    try {
      const process = filledRows.map((r) => {
        const s = stockByKey.get(r.comboKey)!;
        return { plantTypeId: s.plantTypeId, stageCode: s.stageCode, quantity: Number(r.quantity) || 0, outputStageCode: r.outputStageCode };
      });
      const res = await fetch(`/api/finished-goods-weekly/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          process,
          productionWarehouseId: process.length > 0 ? productionWarehouseId ?? undefined : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Gửi thất bại"); return; }
      toast.success(json.xuLy > 0 ? `Đã tạo ${json.xuLy} phiếu xử lý — vào Bàn giao liên kho để bàn giao` : "Đã hoàn thành việc tuần (không có phiếu xử lý)");
      router.push("/task-assignment");
      router.refresh();
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
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
          <CardTitle className="text-base flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Tạo phiếu xử lý (từ Phòng chờ xử lý)</CardTitle>
          <p className="text-xs text-text-secondary">
            Không cần duyệt — mỗi dòng thành 1 phiếu xử lý chờ bàn giao ở Bàn giao liên kho. Bấm Bàn giao ở đó mới trừ Phòng chờ xử lý; Kho mô khu sản xuất nhận vào Phòng đợi xử lý, xử lý xong bàn giao liên kho lại Kho thành phẩm.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {processingStock.length === 0 ? (
            <p className="text-sm text-text-muted py-2">Phòng chờ xử lý đang trống — bấm Hoàn thành nếu tuần này không có gì cần xử lý.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[860px] space-y-2">
                  <div className="grid grid-cols-[2fr_8rem_9rem_9rem_8rem_2.5rem] gap-2 text-sm text-primary-strong font-bold px-1">
                    <span>Mã cây + quy cách</span>
                    <span>Số lượng trong phòng</span>
                    <span>Số lượng lấy ra xử lý</span>
                    <span>Quy cách đầu ra</span>
                    <span>Số lượng đầu ra</span>
                    <span />
                  </div>
                  {rows.map((row) => {
                    const stock = stockByKey.get(row.comboKey);
                    const qty = Number(row.quantity) || 0;
                    return (
                      <div key={row.key} className="grid grid-cols-[2fr_8rem_9rem_9rem_8rem_2.5rem] gap-2 items-center border border-divider rounded-lg p-2">
                        <Combobox
                          items={comboOptions}
                          value={comboOptions.find((o) => o.value === row.comboKey) ?? null}
                          isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                          onValueChange={(v) => {
                            const comboKey = v ? (v as ComboOption).value : "";
                            const s = stockByKey.get(comboKey);
                            updateRow(row.key, { comboKey, quantity: "", outputStageCode: s && s.stageCode in FINISHED_SPEC_LABELS ? s.stageCode : "" });
                          }}
                        >
                          <ComboboxInputGroup className="w-full h-9">
                            <ComboboxInput className="text-xs" placeholder="Gõ mã cây hoặc quy cách…" />
                            <ComboboxTrigger />
                          </ComboboxInputGroup>
                          <ComboboxContent>
                            <ComboboxEmpty>Không có mã cây nào trong Phòng chờ xử lý</ComboboxEmpty>
                            <ComboboxList>
                              {(item: ComboOption) => <ComboboxItem key={item.value} value={item} className="text-xs">{item.label}</ComboboxItem>}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>

                        <div className="text-sm text-foreground text-center">{stock ? `${fmt(stock.quantity)} cây` : "—"}</div>

                        <Input
                          type="number" min={1} max={stock?.quantity} className="h-9 text-xs"
                          value={row.quantity}
                          disabled={!stock}
                          onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                          placeholder={stock ? `Túi ${bagSizeOf(stock.stageCode)} cây` : "—"}
                        />

                        <Select
                          items={OUTPUT_STAGE_CODES.map((c) => ({ value: c, label: FINISHED_SPEC_LABELS[c] }))}
                          value={row.outputStageCode || null}
                          onValueChange={(v) => updateRow(row.key, { outputStageCode: v as string })}
                        >
                          <SelectTrigger className="h-9 text-xs" disabled={!stock}><SelectValue placeholder="Chọn" /></SelectTrigger>
                          <SelectContent>
                            {OUTPUT_STAGE_CODES.map((c) => <SelectItem key={c} value={c}>{FINISHED_SPEC_LABELS[c]}</SelectItem>)}
                          </SelectContent>
                        </Select>

                        <div className="text-sm text-primary-strong font-medium text-center">{qty > 0 ? `${fmt(qty)} cây` : "—"}</div>

                        <Button
                          type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-danger-light"
                          disabled={rows.length <= 1}
                          onClick={() => removeRow(row.key)}
                          title="Xoá dòng"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Thêm dòng
              </Button>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Khu sản xuất nhận phiếu</Label>
              <Select items={productionWarehouses.map((w) => ({ value: w.id, label: w.name }))} value={productionWarehouseId} onValueChange={(v) => setProductionWarehouseId(v as string)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn khu sản xuất" /></SelectTrigger>
                <SelectContent>
                  {productionWarehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ghi chú <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ghi chú thêm (không bắt buộc)…" />
            </div>
          </div>

          <Button className="w-full bg-primary hover:bg-primary-hover" disabled={submitting || !hasProcessingRoom} onClick={() => { if (validate()) setConfirmOpen(true); }}>
            {filledRows.length > 0
              ? <><Plus className="w-4 h-4 mr-2" /> Tạo {filledRows.length > 1 ? `${filledRows.length} phiếu xử lý` : "phiếu xử lý"}</>
              : <><Send className="w-4 h-4 mr-2" /> Hoàn thành (không có phiếu xử lý)</>}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!submitting) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Xác nhận phiếu xử lý tuần</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-text-muted" />
            {filledRows.length > 0 ? `Tạo ${filledRows.length} phiếu xử lý — ${fmt(totalQty)} cây` : "Tuần này không tạo phiếu xử lý nào"}
          </p>
          <div className="flex items-start gap-2 text-sm font-medium text-warning-foreground bg-warning-light rounded-lg p-3">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            Kiểm tra lại: đây là số cây, không phải số túi. Gửi xong nhiệm vụ này sẽ hoàn thành.
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
