"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ProposalItemsTable, summarizeBatchStatus, type Proposal } from "../contamination-proposal-board";

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

  const review = async (id: string, action: "approve" | "reject", reason?: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/contamination-proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) { toast.error((await res.json().catch(() => null))?.message ?? "Có lỗi xảy ra"); return; }
      load();
    } finally {
      setProcessingId(null);
    }
  };

  const approveAll = async () => {
    setApprovingAll(true);
    try {
      const res = await fetch(`/api/contamination-proposals/batch/${encodeURIComponent(batchCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã duyệt nhanh ${json?.count ?? ""} dòng`);
      load();
    } finally {
      setApprovingAll(false);
    }
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
          const pendingCount = items.filter((p) => p.status === "PENDING").length;
          const total = items.reduce((s, p) => s + p.quantity, 0);
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
                      <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={approvingAll} onClick={approveAll}>
                        {approvingAll ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-1.5" />}
                        Duyệt nhanh tất cả ({pendingCount})
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
            </Card>
          );
        })()
      )}
    </div>
  );
}
