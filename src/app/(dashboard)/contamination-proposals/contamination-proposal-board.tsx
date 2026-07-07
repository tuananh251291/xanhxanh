"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Send, Check, X, Plus, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type RoomInventoryItem = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number };
type Proposal = {
  id: string;
  code: string;
  batchCode: string | null;
  type: "TRONG" | "HUY";
  stageCode: string;
  quantity: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  notes: string | null;
  createdAt: string;
  plantType: { code: string; name: string };
  warehouse: { name: string; code: string };
  requestedBy: { name: string };
  approvedBy: { name: string } | null;
};
type PlantTypeOption = { id: string; code: string; name: string };

// crypto.randomUUID() chỉ chạy được trong secure context (HTTPS hoặc localhost) — NV kho mô thường mở
// trang này qua IP LAN bằng HTTP thường (điện thoại), nên cần fallback không phụ thuộc secure context.
// rowKey chỉ dùng làm key nội bộ trong form, không cần độ ngẫu nhiên cấp mật mã.
const newRowKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

type BulkRow = { key: string; plantTypeId: string; stageCode: string; quantity: string };

const DEFAULT_ROW_COUNT = 10;
const makeEmptyRows = () => Array.from({ length: DEFAULT_ROW_COUNT }, () => ({ key: newRowKey(), plantTypeId: "", stageCode: "", quantity: "" }));

type Batch = { batchCode: string; createdAt: string; items: Proposal[] };

// Nhóm các dòng cùng batchCode (cùng 1 lần bấm "Gửi đề xuất") thành 1 "đề xuất" — dòng cũ tạo trước khi
// có tính năng gộp (batchCode null) hiển thị như 1 đề xuất riêng, dùng chính code của nó.
function groupIntoBatches(rows: Proposal[]): Batch[] {
  const map = new Map<string, Proposal[]>();
  for (const p of rows) {
    const key = p.batchCode ?? p.code;
    (map.get(key) ?? map.set(key, []).get(key)!).push(p);
  }
  return Array.from(map.entries())
    .map(([batchCode, items]) => ({
      batchCode,
      createdAt: items.reduce((min, it) => (it.createdAt < min ? it.createdAt : min), items[0].createdAt),
      items,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function summarizeBatchStatus(items: Proposal[]): { label: string; variant: "in-progress" | "completed" | "overdue" } {
  const total = items.length;
  const approved = items.filter((i) => i.status === "APPROVED").length;
  const rejected = items.filter((i) => i.status === "REJECTED").length;
  if (approved + rejected === 0) return { label: "Chờ duyệt", variant: "in-progress" };
  if (approved === total) return { label: "Đã duyệt", variant: "completed" };
  if (rejected === total) return { label: "Từ chối", variant: "overdue" };
  return { label: `Đã xử lý ${approved + rejected}/${total}`, variant: "in-progress" };
}

function ProposalItemsTable({ items, canApprove, canSubmit, processingId, onReview }: {
  items: Proposal[];
  canApprove: boolean;
  canSubmit: boolean;
  processingId: string | null;
  onReview: (id: string, action: "approve" | "reject") => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-divider">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light">
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Mã cây</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Tên cây chi tiết</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Quy cách</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Số lượng</th>
            {canApprove && <th className="px-3 py-2 font-bold text-base"></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b border-divider last:border-0 even:bg-background">
              <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">{p.plantType.code}</td>
              <td className="px-3 py-2 text-foreground">{p.plantType.name}{!canSubmit ? ` · ${p.warehouse.name}` : ""}</td>
              <td className="px-3 py-2 text-foreground">{p.stageCode}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{p.quantity.toLocaleString("vi-VN")}</td>
              {canApprove && (
                <td className="px-3 py-2">
                  {p.status === "PENDING" && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" className="h-7 text-destructive" disabled={processingId === p.id} onClick={() => onReview(p.id, "reject")}>
                        {processingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" className="h-7 bg-primary hover:bg-primary-hover" disabled={processingId === p.id} onClick={() => onReview(p.id, "approve")}>
                        {processingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" /> Duyệt</>}
                      </Button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchTable({ batches, canApprove, canSubmit, processingId, onReview }: {
  batches: Batch[];
  canApprove: boolean;
  canSubmit: boolean;
  processingId: string | null;
  onReview: (id: string, action: "approve" | "reject") => void;
}) {
  const [openBatchCode, setOpenBatchCode] = useState<string | null>(null);
  // Tra lại từ batches (không giữ snapshot riêng) để nội dung popup luôn khớp trạng thái mới nhất sau
  // khi Admin duyệt/từ chối 1 dòng cây ngay trong popup rồi danh sách được load lại.
  const openBatch = batches.find((b) => b.batchCode === openBatchCode) ?? null;

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã đề xuất</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Thời gian đề xuất</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Trạng thái</th>
                  <th className="px-3 py-2 font-bold text-base"></th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-text-muted">Chưa có đề xuất nào</td></tr>
                ) : batches.map((batch) => {
                  const summary = summarizeBatchStatus(batch.items);
                  return (
                    <tr key={batch.batchCode} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                      <td className="px-3 py-2 font-mono text-xs text-info-foreground">{batch.batchCode}</td>
                      <td className="px-3 py-2 text-foreground">{format(new Date(batch.createdAt), "dd/MM/yyyy", { locale: vi })}</td>
                      <td className="px-3 py-2">
                        <Badge variant={summary.variant}>{summary.label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button type="button" size="sm" variant="outline" onClick={() => setOpenBatchCode(batch.batchCode)}>
                          <ChevronDown className="w-3.5 h-3.5 mr-1" /> Xem thêm
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!openBatch} onOpenChange={(open) => { if (!open) setOpenBatchCode(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chi tiết đề xuất {openBatch?.batchCode}</DialogTitle>
          </DialogHeader>
          {openBatch && (
            <ProposalItemsTable items={openBatch.items} canApprove={canApprove} canSubmit={canSubmit} processingId={processingId} onReview={onReview} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkEntryTable({
  title, rows, onChangeRow, onAddRow, onRemoveRow, plantTypes, inventory,
}: {
  title: string;
  rows: BulkRow[];
  onChangeRow: (key: string, patch: Partial<BulkRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (key: string) => void;
  plantTypes: PlantTypeOption[];
  inventory: RoomInventoryItem[];
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-2 py-2 text-primary-strong font-bold text-base">Mã cây</th>
                  <th className="text-left px-2 py-2 text-primary-strong font-bold text-base">Quy cách</th>
                  <th className="text-right px-2 py-2 text-primary-strong font-bold text-base w-28">Số lượng</th>
                  <th className="w-8 px-1 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const stageOptions = inventory.filter((i) => i.plantTypeId === row.plantTypeId);
                  return (
                    <tr key={row.key} className="border-b border-divider last:border-0">
                      <td className="px-2 py-1.5">
                        <Select
                          items={plantTypes.map((pt) => ({ value: pt.id, label: `${pt.code} — ${pt.name}` }))}
                          value={row.plantTypeId || null}
                          onValueChange={(v) => onChangeRow(row.key, { plantTypeId: v as string, stageCode: "" })}
                        >
                          <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Chọn mã cây" /></SelectTrigger>
                          <SelectContent>
                            {plantTypes.map((pt) => (
                              <SelectItem key={pt.id} value={pt.id}>{pt.code} — {pt.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Select
                          items={stageOptions.map((s) => ({ value: s.stageCode, label: `${s.stageCode} (tồn: ${s.quantity.toLocaleString("vi-VN")})` }))}
                          value={row.stageCode || null}
                          onValueChange={(v) => onChangeRow(row.key, { stageCode: v as string })}
                        >
                          <SelectTrigger className="h-9 w-full" disabled={!row.plantTypeId}><SelectValue placeholder="Chọn quy cách" /></SelectTrigger>
                          <SelectContent>
                            {stageOptions.map((s) => (
                              <SelectItem key={s.stageCode} value={s.stageCode}>{s.stageCode} (tồn: {s.quantity.toLocaleString("vi-VN")})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={1}
                          className="h-9 text-right"
                          value={row.quantity}
                          onChange={(e) => onChangeRow(row.key, { quantity: e.target.value })}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveRow(row.key)}
                          className="text-text-muted hover:text-destructive transition-colors"
                          title="Xoá dòng"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Thêm dòng
      </Button>
    </div>
  );
}

export default function ContaminationProposalBoard({ canSubmit, canApprove }: { canSubmit: boolean; canApprove: boolean }) {
  const [inventory, setInventory] = useState<RoomInventoryItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(canApprove);

  const [huyRows, setHuyRows] = useState<BulkRow[]>(makeEmptyRows);
  const [trongRows, setTrongRows] = useState<BulkRow[]>(makeEmptyRows);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests: Promise<unknown>[] = [fetch("/api/contamination-proposals").then((r) => r.json())];
      if (canSubmit) requests.push(fetch("/api/contamination-room").then((r) => r.json()));
      const [proposalsData, inventoryData] = await Promise.all(requests);
      setProposals(Array.isArray(proposalsData) ? proposalsData : []);
      if (canSubmit) setInventory(Array.isArray(inventoryData) ? inventoryData : []);
    } finally {
      setLoading(false);
    }
  }, [canSubmit]);

  useEffect(() => { load(); }, [load]);

  const plantTypes = useMemo(() => {
    const map = new Map<string, PlantTypeOption>();
    for (const item of inventory) {
      if (!map.has(item.plantTypeId)) map.set(item.plantTypeId, { id: item.plantTypeId, code: item.plantTypeCode, name: item.plantTypeName });
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [inventory]);

  const changeRow = (setRows: typeof setHuyRows, key: string, patch: Partial<BulkRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (setRows: typeof setHuyRows) =>
    setRows((prev) => [...prev, { key: newRowKey(), plantTypeId: "", stageCode: "", quantity: "" }]);
  const removeRow = (setRows: typeof setHuyRows, key: string) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  const submitAll = async () => {
    type Candidate = { type: "HUY" | "TRONG"; plantTypeId: string; stageCode: string; quantity: number };
    const candidates: Candidate[] = [];
    for (const r of huyRows) {
      const qty = parseInt(r.quantity, 10) || 0;
      if (r.plantTypeId && r.stageCode && qty > 0) candidates.push({ type: "HUY", plantTypeId: r.plantTypeId, stageCode: r.stageCode, quantity: qty });
    }
    for (const r of trongRows) {
      const qty = parseInt(r.quantity, 10) || 0;
      if (r.plantTypeId && r.stageCode && qty > 0) candidates.push({ type: "TRONG", plantTypeId: r.plantTypeId, stageCode: r.stageCode, quantity: qty });
    }
    if (candidates.length === 0) { toast.error("Chưa điền dòng đề xuất nào"); return; }

    const remaining = new Map<string, number>();
    for (const item of inventory) remaining.set(`${item.plantTypeId}:${item.stageCode}`, item.quantity);
    // Các dòng cùng loại (Hủy/Trồng) gửi trong cùng 1 lần bấm được gộp chung 1 "đề xuất" — dòng đầu tiên
    // của mỗi loại quyết định batchCode, các dòng sau truyền lại đúng batchCode đó (xem POST route).
    const batchCodeByType: Record<"HUY" | "TRONG", string | undefined> = { HUY: undefined, TRONG: undefined };

    setSubmitting(true);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const c of candidates) {
        const key = `${c.plantTypeId}:${c.stageCode}`;
        const avail = remaining.get(key) ?? 0;
        if (c.quantity > avail) { failCount++; continue; }
        const res = await fetch("/api/contamination-proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: c.type, plantTypeId: c.plantTypeId, stageCode: c.stageCode, quantity: c.quantity,
            batchCode: batchCodeByType[c.type],
          }),
        });
        if (res.ok) {
          const created = await res.json();
          batchCodeByType[c.type] ??= created.batchCode;
          okCount++;
          remaining.set(key, avail - c.quantity);
        } else failCount++;
      }
      if (okCount > 0) toast.success(`Đã gửi ${okCount} đề xuất — chờ Admin duyệt`);
      if (failCount > 0) toast.error(`${failCount} dòng không gửi được (vượt tồn Phòng nhiễm hoặc lỗi)`);
      if (okCount > 0) {
        setHuyRows(makeEmptyRows());
        setTrongRows(makeEmptyRows());
        load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (id: string, action: "approve" | "reject") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/contamination-proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(action === "approve" ? "Đã duyệt đề xuất" : "Đã từ chối đề xuất — đã hoàn số lượng về Phòng nhiễm");
      load();
    } finally {
      setProcessingId(null);
    }
  };

  const huyProposals = proposals.filter((p) => p.type === "HUY");
  const trongProposals = proposals.filter((p) => p.type === "TRONG");
  const pendingCount = proposals.filter((p) => p.status === "PENDING").length;
  const huyBatches = groupIntoBatches(huyProposals);
  const trongBatches = groupIntoBatches(trongProposals);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-primary-strong font-bold">Danh sách đề xuất Trồng/Hủy</CardTitle>
          <p className="text-sm text-text-muted">
            {proposals.length} đề xuất — {huyProposals.length} hủy, {trongProposals.length} trồng
            {canApprove && pendingCount > 0 && <span className="text-warning-foreground font-medium"> · {pendingCount} chờ duyệt</span>}
          </p>
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Ẩn bớt</> : <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Xem chi tiết</>}
            </Button>
          </CardAction>
        </CardHeader>
        {showDetails && (
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Đề xuất Hủy <span className="font-normal text-text-muted">({huyProposals.length})</span></h3>
                <BatchTable batches={huyBatches} canApprove={canApprove} canSubmit={canSubmit} processingId={processingId} onReview={review} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Đề xuất Trồng <span className="font-normal text-text-muted">({trongProposals.length})</span></h3>
                <BatchTable batches={trongBatches} canApprove={canApprove} canSubmit={canSubmit} processingId={processingId} onReview={review} />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {canSubmit && (
        <Card>
          <CardHeader><CardTitle className="text-primary-strong font-bold">Tạo đề xuất Trồng/Hủy mới</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {plantTypes.length === 0 && (
              <p className="text-sm text-text-muted flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Phòng nhiễm hiện không có hàng nào để đề xuất.
              </p>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BulkEntryTable
                title="Đề xuất Hủy"
                rows={huyRows}
                onChangeRow={(key, patch) => changeRow(setHuyRows, key, patch)}
                onAddRow={() => addRow(setHuyRows)}
                onRemoveRow={(key) => removeRow(setHuyRows, key)}
                plantTypes={plantTypes}
                inventory={inventory}
              />
              <BulkEntryTable
                title="Đề xuất Trồng"
                rows={trongRows}
                onChangeRow={(key, patch) => changeRow(setTrongRows, key, patch)}
                onAddRow={() => addRow(setTrongRows)}
                onRemoveRow={(key) => removeRow(setTrongRows, key)}
                plantTypes={plantTypes}
                inventory={inventory}
              />
            </div>
            <div className="flex justify-center pt-2">
              <Button size="lg" className="bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submitAll}>
                {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                Gửi đề xuất
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
