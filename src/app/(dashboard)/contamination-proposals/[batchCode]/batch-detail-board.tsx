"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ProposalItemsTable, summarizeBatchStatus, canApproveProposal, canSplitFreeGift, withQuantity, withFreeGift, MARKET_ROOM_TYPE_SET, type Proposal, type ApprovalSplit } from "../contamination-proposal-board";

// Trang chi tiết 1 "đề xuất" (batchCode, hoặc chính `code` của dòng đơn lẻ tạo trước khi có tính năng
// gộp) — tách khỏi popup "Xem thêm" cũ vì có phiếu gộp tới vài chục loại cây, hiện hết trong 1 khung nhỏ
// dễ tràn màn hình. Thêm "Duyệt nhanh tất cả" để Admin khỏi phải bấm Duyệt từng dòng cây.
export default function BatchDetailBoard({
  batchCode, canApprove, canSubmit, currentUserId, currentUserRole, currentUserWarehouseId,
}: {
  batchCode: string;
  canApprove: boolean;
  canSubmit: boolean;
  currentUserId?: string;
  currentUserRole?: string | null;
  currentUserWarehouseId?: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  // Kho thị trường: hộp thoại sửa số/chia Free Gift từng dòng rồi duyệt tất cả 1 lần (phiếu gộp theo ngày) — key = proposal id.
  const [editOpen, setEditOpen] = useState(false);
  const [splitDraft, setSplitDraft] = useState<Record<string, ApprovalSplit>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contamination-proposals/batch/${encodeURIComponent(batchCode)}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [batchCode]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, action: "approve" | "reject", reason?: string, split?: ApprovalSplit) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/contamination-proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, split }),
      });
      if (!res.ok) { toast.error((await res.json().catch(() => null))?.message ?? "Có lỗi xảy ra"); return; }
      load();
    } finally {
      setProcessingId(null);
    }
  };

  const approveAll = async (splits?: Record<string, ApprovalSplit>) => {
    setApprovingAll(true);
    try {
      const res = await fetch(`/api/contamination-proposals/batch/${encodeURIComponent(batchCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", splits }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã duyệt ${json?.count ?? ""} dòng`);
      setEditOpen(false);
      load();
    } finally {
      setApprovingAll(false);
    }
  };

  const isMarketBatch = items.some((p) => !!p.room?.type && MARKET_ROOM_TYPE_SET.has(p.room.type));
  const pendingItems = items.filter((p) => p.status === "PENDING");

  const openEdit = () => {
    setSplitDraft(Object.fromEntries(pendingItems.map((p) => [p.id, { quantity: p.quantity, freeGift: 0 }])));
    setEditOpen(true);
  };

  const allToFreeGift = () => {
    setSplitDraft((d) => ({ ...d, ...Object.fromEntries(pendingItems.filter(canSplitFreeGift).map((p) => [p.id, { quantity: 0, freeGift: p.quantity }])) }));
  };

  const submitEdit = () => {
    const empty = pendingItems.find((p) => { const s = splitDraft[p.id]; return s && s.quantity + s.freeGift === 0; });
    if (empty) {
      toast.error(`${empty.plantType.code} ${empty.stageCode}: số lượng đang bằng 0 — muốn bỏ dòng này thì đóng hộp thoại và Từ chối`);
      return;
    }
    approveAll(splitDraft);
  };

  // Đúng NV đã gửi đề xuất này, HOẶC Quản lý kho thành phẩm của đúng kho đó (chỉ áp dụng đề xuất Kho
  // thành phẩm — có room) — khớp permission server-side ở PATCH /api/contamination-proposals/[id].
  const canResubmit = (p: Proposal) => {
    if (p.status !== "REJECTED") return false;
    if (p.requestedById === currentUserId) return true;
    return !!p.room && currentUserRole === "QUAN_LY_KHO_THANH_PHAM" && p.warehouseId === currentUserWarehouseId;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Quay lại
      </Button>

      {items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">Không tìm thấy đề xuất này</CardContent></Card>
      ) : (
        (() => {
          const summary = summarizeBatchStatus(items);
          const pendingCount = items.filter((p) => p.status === "PENDING" && canApproveProposal(p, currentUserRole)).length;
          const total = items.reduce((s, p) => s + p.quantity + p.freeGiftQuantity, 0);
          return (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="font-mono">{batchCode}</CardTitle>
                    <p className="text-sm text-text-muted mt-1">
                      {items.length} dòng · {total.toLocaleString("vi-VN")} cây/cụm · {items[0].warehouse.name} · gửi bởi {items[0].requestedBy.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={summary.variant}>{summary.label}</Badge>
                    {canApprove && pendingCount > 0 && (
                      <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={approvingAll} onClick={() => (isMarketBatch ? openEdit() : approveAll())}>
                        {approvingAll ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-1.5" />}
                        {isMarketBatch ? `Sửa số, Free Gift & duyệt tất cả (${pendingCount})` : `Duyệt nhanh tất cả (${pendingCount})`}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ProposalItemsTable
                  items={items} canApprove={canApprove} canSubmit={canSubmit} canResubmit={canResubmit}
                  processingId={processingId} onReview={review} onSaved={load}
                />
              </CardContent>
              <Dialog open={editOpen} onOpenChange={(o) => { if (!approvingAll) setEditOpen(o); }}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Sửa số, Free Gift & duyệt tất cả — {batchCode}</DialogTitle></DialogHeader>
                  <p className="text-xs text-text-secondary bg-info-light rounded-lg p-2">
                    Tổng Trồng/Hủy và Free Gift mỗi dòng không được vượt số Đối tác đề xuất, phần chênh hoàn về phòng nguồn.
                    Cây chuyển sang Free Gift được cộng vào mã Free Gift của kho. Muốn bỏ hẳn 1 dòng thì đóng hộp thoại và Từ chối dòng đó.
                  </p>
                  <div className="overflow-x-auto border border-divider rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-light">
                          <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                          <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                          <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Phòng</th>
                          <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Đề xuất</th>
                          <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Tổng</th>
                          <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Trồng/Hủy</th>
                          <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Free Gift</th>
                          <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Hoàn nguồn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingItems.map((p) => {
                          const split = splitDraft[p.id] ?? { quantity: p.quantity, freeGift: 0 };
                          const setSplit = (next: ApprovalSplit) => setSplitDraft((d) => ({ ...d, [p.id]: next }));
                          return (
                            <tr key={p.id} className="border-b last:border-0 even:bg-primary-light/30">
                              <td className="px-3 py-1.5 font-mono">{p.plantType.code}</td>
                              <td className="px-3 py-1.5">{p.stageCode}{p.type === "TRONG" && p.plantStageCode ? ` → ${p.plantStageCode}` : ""}</td>
                              <td className="px-3 py-1.5 text-text-secondary">{p.room?.name ?? "—"}</td>
                              <td className="px-3 py-1.5">{p.type === "TRONG" ? "Trồng" : "Hủy"}</td>
                              <td className="px-3 py-1.5 text-right font-medium">{p.quantity.toLocaleString("vi-VN")}</td>
                              <td className="px-3 py-1.5">
                                <Input type="number" min={0} max={p.quantity} className="h-8 w-24" value={split.quantity}
                                  onChange={(e) => setSplit(withQuantity(split, e.target.value, p.quantity))} />
                              </td>
                              <td className="px-3 py-1.5">
                                <Input type="number" min={0} max={p.quantity} className="h-8 w-24" disabled={!canSplitFreeGift(p)} value={split.freeGift}
                                  onChange={(e) => setSplit(withFreeGift(split, e.target.value, p.quantity))} />
                              </td>
                              <td className="px-3 py-1.5 text-right">{(p.quantity - split.quantity - split.freeGift).toLocaleString("vi-VN")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditOpen(false)} disabled={approvingAll}>Đóng</Button>
                    <Button variant="outline" onClick={allToFreeGift} disabled={approvingAll}>Free Gift tất cả</Button>
                    <Button className="bg-primary hover:bg-primary-hover" onClick={submitEdit} disabled={approvingAll}>
                      {approvingAll ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-1.5" />}
                      Duyệt tất cả ({pendingItems.length})
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Card>
          );
        })()
      )}
    </div>
  );
}
