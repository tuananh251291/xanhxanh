"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, X, ChevronDown, ChevronUp, Pencil, Send } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";

type Proposal = {
  id: string;
  code: string;
  batchCode: string | null;
  type: "TRONG" | "HUY";
  stageCode: string;
  quantity: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  plantType: { code: string; name: string };
  warehouse: { name: string; code: string };
  warehouseId: string;
  room: { name: string } | null;
  productionGarden: { code: string; name: string } | null;
  requestedBy: { name: string };
  requestedById: string;
  approvedBy: { name: string } | null;
};
type Batch = { batchCode: string; createdAt: string; items: Proposal[] };

// Nhóm các dòng cùng batchCode (cùng 1 lần bấm "Gửi đề xuất trồng/hủy") thành 1 "đề xuất" — dòng cũ tạo
// trước khi có tính năng gộp (batchCode null) hiển thị như 1 đề xuất riêng, dùng chính code của nó.
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

// Admin bấm "Từ chối" — popup xác nhận kèm ô lý do (tuỳ chọn), hiện trong thông báo gửi NV + trên phiếu
// để NV biết cần sửa gì trước khi "Sửa & gửi lại".
function RejectDialog({ onConfirm, loading }: { onConfirm: (reason: string) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setReason(""); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-7 text-destructive" disabled={loading} />}>
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Từ chối đề xuất?</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Lý do (tuỳ chọn — NV sẽ thấy lý do này)</Label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Sai số lượng, ghi nhầm loại..."
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={loading} onClick={() => setOpen(false)}>Huỷ</Button>
          <Button
            className="bg-destructive hover:bg-destructive/90 text-black"
            disabled={loading}
            onClick={() => { onConfirm(reason.trim()); setOpen(false); setReason(""); }}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
            Xác nhận từ chối
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "Sửa & gửi lại" — chỉ đổi được Số lượng/Loại/Ghi chú (mã cây, quy cách, phòng nguồn giữ nguyên như
// phiếu gốc, xem PATCH /api/contamination-proposals/[id] nhánh resubmit), hiện cho đề xuất REJECTED mà
// NV đang xem có quyền sửa (đúng NV đã gửi, hoặc Quản lý kho thành phẩm cùng kho).
function ResubmitDialog({ proposal, onSaved }: { proposal: Proposal; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"TRONG" | "HUY">(proposal.type);
  const [quantity, setQuantity] = useState(String(proposal.quantity));
  const [notes, setNotes] = useState(proposal.notes ?? "");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setType(proposal.type);
    setQuantity(String(proposal.quantity));
    setNotes(proposal.notes ?? "");
  };

  const submit = async () => {
    const value = Number(quantity);
    if (!Number.isFinite(value) || value <= 0) { toast.error("Số lượng không hợp lệ"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/contamination-proposals/${proposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resubmit: true, type, quantity: value, notes: notes.trim() || undefined }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã sửa & gửi lại phiếu ${proposal.code}`);
      setOpen(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-7" />}>
        <Pencil className="w-3.5 h-3.5 mr-1" /> Sửa & gửi lại
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa & gửi lại phiếu {proposal.code}</DialogTitle>
        </DialogHeader>
        {proposal.rejectionReason && (
          <p className="text-sm bg-danger-light text-destructive rounded-lg p-3">
            <strong>Lý do từ chối:</strong> {proposal.rejectionReason}
          </p>
        )}
        <p className="text-xs text-text-muted">
          {proposal.plantType.code} — {proposal.plantType.name} ({proposal.stageCode}){proposal.room ? ` · ${proposal.room.name}` : ""} — giữ nguyên mã
          cây/quy cách/phòng, chỉ sửa được số lượng/loại/ghi chú.
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Loại</Label>
            <Select items={[{ value: "HUY", label: "Hủy" }, { value: "TRONG", label: "Trồng" }]} value={type} onValueChange={(v) => setType(v as "TRONG" | "HUY")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HUY">Hủy</SelectItem>
                <SelectItem value="TRONG">Trồng</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Số lượng</Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Huỷ</Button>
          <Button className="bg-primary hover:bg-primary-hover" disabled={saving} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Gửi lại
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalItemsTable({ items, canApprove, canSubmit, canResubmit, processingId, onReview, onSaved }: {
  items: Proposal[];
  canApprove: boolean;
  canSubmit: boolean;
  canResubmit: (p: Proposal) => boolean;
  processingId: string | null;
  onReview: (id: string, action: "approve" | "reject", reason?: string) => void;
  onSaved: () => void;
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
            {(canApprove || canSubmit) && <th className="px-3 py-2 font-bold text-base"></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b border-divider last:border-0 even:bg-background">
              <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">{p.plantType.code}</td>
              <td className="px-3 py-2 text-foreground">
                {p.plantType.name}
                {!canSubmit ? ` · ${p.warehouse.name}` : ""}
                {p.room ? ` · ${p.room.name}` : ""}
                {p.productionGarden ? ` · Vườn: ${p.productionGarden.name} (${p.productionGarden.code})` : ""}
                {p.status === "REJECTED" && p.rejectionReason && (
                  <p className="text-xs text-destructive mt-0.5">Lý do: {p.rejectionReason}</p>
                )}
              </td>
              <td className="px-3 py-2 text-foreground">{p.stageCode}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{p.quantity.toLocaleString("vi-VN")}</td>
              {(canApprove || canSubmit) && (
                <td className="px-3 py-2">
                  {canApprove && p.status === "PENDING" && (
                    <div className="flex gap-1 justify-end">
                      <RejectDialog loading={processingId === p.id} onConfirm={(reason) => onReview(p.id, "reject", reason)} />
                      <Button size="sm" className="h-7 bg-primary hover:bg-primary-hover" disabled={processingId === p.id} onClick={() => onReview(p.id, "approve")}>
                        {processingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" /> Duyệt</>}
                      </Button>
                    </div>
                  )}
                  {!canApprove && canResubmit(p) && (
                    <div className="flex justify-end">
                      <ResubmitDialog proposal={p} onSaved={onSaved} />
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

function BatchTable({ batches, canApprove, canSubmit, canResubmit, processingId, onReview, onSaved }: {
  batches: Batch[];
  canApprove: boolean;
  canSubmit: boolean;
  canResubmit: (p: Proposal) => boolean;
  processingId: string | null;
  onReview: (id: string, action: "approve" | "reject", reason?: string) => void;
  onSaved: () => void;
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
            <ProposalItemsTable
              items={openBatch.items} canApprove={canApprove} canSubmit={canSubmit} canResubmit={canResubmit}
              processingId={processingId} onReview={onReview} onSaved={onSaved}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Chỉ còn hiển thị danh sách đề xuất đã gửi — tạo đề xuất mới đã chuyển sang mục "Kiểm tra kho nhiễm cá
// nhân" trong nhiệm vụ ngày của Kho mô (xem contamination-personal-board.tsx), gộp nhiều NV/nhiều ngày
// thành 1 phiếu chung trước khi gửi Admin duyệt.
export default function ContaminationProposalBoard({
  canSubmit, canApprove, currentUserId, currentUserRole, currentUserWarehouseId,
}: {
  canSubmit: boolean;
  canApprove: boolean;
  currentUserId?: string;
  currentUserRole?: string | null;
  currentUserWarehouseId?: string | null;
}) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(canApprove);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contamination-proposals");
      const data = await res.json();
      setProposals(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, action: "approve" | "reject", reason?: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/contamination-proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) return;
      load();
    } finally {
      setProcessingId(null);
    }
  };

  // Đúng NV đã gửi đề xuất này, HOẶC Quản lý kho thành phẩm của đúng kho đó (chỉ áp dụng đề xuất Kho
  // thành phẩm — có room) — khớp permission server-side ở PATCH /api/contamination-proposals/[id].
  const canResubmit = (p: Proposal) => {
    if (p.status !== "REJECTED") return false;
    if (p.requestedById === currentUserId) return true;
    return !!p.room && currentUserRole === "QUAN_LY_KHO_THANH_PHAM" && p.warehouseId === currentUserWarehouseId;
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
              <BatchTable batches={huyBatches} canApprove={canApprove} canSubmit={canSubmit} canResubmit={canResubmit} processingId={processingId} onReview={review} onSaved={load} />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Đề xuất Trồng <span className="font-normal text-text-muted">({trongProposals.length})</span></h3>
              <BatchTable batches={trongBatches} canApprove={canApprove} canSubmit={canSubmit} canResubmit={canResubmit} processingId={processingId} onReview={review} onSaved={load} />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
