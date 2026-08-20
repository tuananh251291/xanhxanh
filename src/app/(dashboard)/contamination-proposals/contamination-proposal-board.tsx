"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Send, Check, X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
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

// Nhập 1 trong 2 ô "Số trồng"/"Số hủy" cho từng dòng tồn Phòng nhiễm, ô còn lại tự tính phần dư
// (luôn tổng = tồn) — huyByKey là nguồn dữ liệu duy nhất (giá trị "Số trồng" chỉ là suy ra để hiển thị
// và để gõ ngược lại), tránh 2 state lệch nhau.
function InventoryEntryTable({ inventory, huyByKey, onChangeHuy, onChangeTrong }: {
  inventory: RoomInventoryItem[];
  huyByKey: Record<string, string>;
  onChangeHuy: (key: string, raw: string) => void;
  onChangeTrong: (key: string, raw: string, total: number) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã cây</th>
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Tên cây</th>
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Quy cách</th>
                <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Tồn</th>
                <th className="text-right px-3 py-2 text-primary-strong font-bold text-base w-28">Số trồng</th>
                <th className="text-right px-3 py-2 text-primary-strong font-bold text-base w-28">Số hủy</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const key = `${item.plantTypeId}:${item.stageCode}`;
                const huyRaw = huyByKey[key] ?? "";
                const huyNum = huyRaw === "" ? null : parseInt(huyRaw, 10) || 0;
                const trongDisplay = huyNum === null ? "" : String(Math.max(0, item.quantity - huyNum));
                return (
                  <tr key={key} className="border-b border-divider last:border-0 even:bg-background">
                    <td className="px-3 py-1.5 font-mono text-foreground whitespace-nowrap">{item.plantTypeCode}</td>
                    <td className="px-3 py-1.5 text-foreground">{item.plantTypeName}</td>
                    <td className="px-3 py-1.5 text-foreground">{item.stageCode}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-foreground">{item.quantity.toLocaleString("vi-VN")}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={item.quantity}
                        className="h-9 text-right"
                        value={trongDisplay}
                        onChange={(e) => onChangeTrong(key, e.target.value, item.quantity)}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={item.quantity}
                        className="h-9 text-right"
                        value={huyRaw}
                        onChange={(e) => onChangeHuy(key, e.target.value)}
                        placeholder="0"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContaminationProposalBoard({ canSubmit, canApprove }: { canSubmit: boolean; canApprove: boolean }) {
  const [inventory, setInventory] = useState<RoomInventoryItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(canApprove);

  const [huyByKey, setHuyByKey] = useState<Record<string, string>>({});

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

  // Sửa "Số hủy": lưu thẳng giá trị gõ vào (rỗng = chưa quyết định dòng này, "Số trồng" tự suy ra khi hiển thị).
  const changeHuy = (key: string, raw: string) =>
    setHuyByKey((prev) => ({ ...prev, [key]: raw }));
  // Sửa "Số trồng": quy đổi ngược lại thành "Số hủy" tương ứng (tổng luôn = tồn) rồi lưu vào cùng 1 state.
  const changeTrong = (key: string, raw: string, total: number) =>
    setHuyByKey((prev) => ({ ...prev, [key]: raw === "" ? "" : String(Math.max(0, total - (parseInt(raw, 10) || 0))) }));

  const submitAll = async () => {
    type Candidate = { type: "HUY" | "TRONG"; plantTypeId: string; stageCode: string; quantity: number };
    const candidates: Candidate[] = [];
    for (const item of inventory) {
      const key = `${item.plantTypeId}:${item.stageCode}`;
      const huyRaw = huyByKey[key];
      if (huyRaw === undefined || huyRaw === "") continue;
      const huyQty = Math.max(0, Math.min(item.quantity, parseInt(huyRaw, 10) || 0));
      const trongQty = item.quantity - huyQty;
      if (huyQty > 0) candidates.push({ type: "HUY", plantTypeId: item.plantTypeId, stageCode: item.stageCode, quantity: huyQty });
      if (trongQty > 0) candidates.push({ type: "TRONG", plantTypeId: item.plantTypeId, stageCode: item.stageCode, quantity: trongQty });
    }
    if (candidates.length === 0) { toast.error("Chưa điền dòng đề xuất nào"); return; }

    // Các dòng cùng loại (Hủy/Trồng) gửi trong cùng 1 lần bấm được gộp chung 1 "đề xuất" — dòng đầu tiên
    // của mỗi loại quyết định batchCode, các dòng sau truyền lại đúng batchCode đó (xem POST route).
    const batchCodeByType: Record<"HUY" | "TRONG", string | undefined> = { HUY: undefined, TRONG: undefined };

    setSubmitting(true);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const c of candidates) {
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
        } else failCount++;
      }
      if (okCount > 0) toast.success(`Đã gửi ${okCount} đề xuất — chờ Admin duyệt`);
      if (failCount > 0) toast.error(`${failCount} dòng không gửi được (vượt tồn Phòng nhiễm hoặc lỗi)`);
      if (okCount > 0) {
        setHuyByKey({});
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
            {inventory.length === 0 ? (
              <p className="text-sm text-text-muted flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Phòng nhiễm hiện không có hàng nào để đề xuất.
              </p>
            ) : (
              <>
                <p className="text-sm text-text-muted">
                  Nhập số lượng vào ô &quot;Số trồng&quot; hoặc &quot;Số hủy&quot; cho từng dòng — số còn lại tự động tính bằng phần chênh lệch so với tồn.
                </p>
                <InventoryEntryTable inventory={inventory} huyByKey={huyByKey} onChangeHuy={changeHuy} onChangeTrong={changeTrong} />
              </>
            )}
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
