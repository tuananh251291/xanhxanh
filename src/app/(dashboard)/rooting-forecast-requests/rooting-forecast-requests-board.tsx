"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Check, X } from "lucide-react";
import { format, addMonths } from "date-fns";
import { toast } from "sonner";

type ProposalItem = { id: string; plantTypeId: string; quantity: number; plantType: { code: string; name: string }; assignedStaff: { code: string; name: string } };
type Proposal = {
  id: string; taskMonth: string; reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null; createdAt: string; reviewedAt: string | null;
  warehouse: { code: string; name: string };
  requestedBy: { code: string; name: string };
  reviewedBy: { code: string; name: string } | null;
  items: ProposalItem[];
};

function ProposalStatusBadge({ status }: { status: Proposal["status"] }) {
  if (status === "APPROVED") return <Badge variant="completed">Đã duyệt</Badge>;
  if (status === "REJECTED") return <Badge variant="overdue">Từ chối</Badge>;
  return <Badge variant="in-progress">Chờ duyệt</Badge>;
}

function RejectDialog({ onConfirm, loading }: { onConfirm: (reason: string) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setReason(""); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-7 text-destructive" disabled={loading} />}>
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        {" "}Từ chối
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
            placeholder="VD: Số lượng chưa hợp lý, cần xác nhận lại..."
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

function ProposalCard({ proposal, processing, onReview }: {
  proposal: Proposal;
  processing: boolean;
  onReview: (action: "approve" | "reject", reason?: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="font-bold text-primary-strong">
              {proposal.warehouse.code} — {proposal.warehouse.name} · Tháng {format(addMonths(new Date(proposal.taskMonth), 1), "MM/yyyy")}
            </p>
            <p className="text-xs text-text-muted">
              NV đề xuất: {proposal.requestedBy.code} — {proposal.requestedBy.name} · {format(new Date(proposal.createdAt), "dd/MM/yyyy HH:mm")}
            </p>
          </div>
          <ProposalStatusBadge status={proposal.status} />
        </div>

        <p className="text-sm bg-info-light text-info-foreground rounded-md px-3 py-2">
          <strong>Lý do:</strong> {proposal.reason}
        </p>

        {proposal.status === "REJECTED" && proposal.rejectionReason && (
          <p className="text-sm bg-danger-light text-destructive rounded-md px-3 py-2">
            <strong>Lý do từ chối:</strong> {proposal.rejectionReason}
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-divider">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã cây</th>
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">NV cấy mô</th>
                <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Số lượng</th>
              </tr>
            </thead>
            <tbody>
              {proposal.items.map((item) => (
                <tr key={item.id} className="border-b border-divider last:border-0 even:bg-background">
                  <td className="px-3 py-2 font-mono text-foreground">{item.plantType.code} — {item.plantType.name}</td>
                  <td className="px-3 py-2 text-foreground">{item.assignedStaff.code} — {item.assignedStaff.name}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{item.quantity.toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {proposal.status === "PENDING" && (
          <div className="flex gap-2 justify-end">
            <RejectDialog loading={processing} onConfirm={(reason) => onReview("reject", reason)} />
            <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={processing} onClick={() => onReview("approve")}>
              {processing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              Duyệt
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RootingForecastRequestsBoard() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rooting-forecast-edit-proposals");
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
      const res = await fetch(`/api/rooting-forecast-edit-proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.message ?? "Có lỗi xảy ra"); return; }
      toast.success(action === "approve" ? "Đã duyệt đề xuất" : "Đã từ chối đề xuất");
      load();
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  const pendingCount = proposals.filter((p) => p.status === "PENDING").length;

  if (proposals.length === 0) {
    return <Card><CardContent className="py-12 text-center text-text-secondary">Chưa có đề xuất chỉnh sửa nào</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        {proposals.length} đề xuất
        {pendingCount > 0 && <span className="text-warning-foreground font-medium"> · {pendingCount} chờ duyệt</span>}
      </p>
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} processing={processingId === p.id} onReview={(action, reason) => review(p.id, action, reason)} />
      ))}
    </div>
  );
}
