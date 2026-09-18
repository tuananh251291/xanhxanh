"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import type { InspectionLane } from "@prisma/client";
import { INSPECTION_LANE_LABELS, INSPECTION_LANE_COLORS } from "@/types";

// Ghi đè tạm thời luồng kiểm tra (Xanh/Vàng/Đỏ) của 1 NV cấy mô theo khoảng ngày — chỉ Admin
// (isAdminRole, xem chỗ gọi component này) — ngoài khoảng đã chọn, hệ thống tự trả lại đúng giá trị tự
// tính hàng tháng (xem ensureInspectionLaneOverridesApplied, src/lib/inspection-lane.ts).
export default function InspectionLaneOverrideDialog({
  userId,
  userName,
  inspectionLane,
  inspectionLaneOverride,
  inspectionLaneOverrideStartAt,
  inspectionLaneOverrideEndAt,
}: {
  userId: string;
  userName: string;
  inspectionLane: InspectionLane | null;
  inspectionLaneOverride: InspectionLane | null;
  inspectionLaneOverrideStartAt: Date | null;
  inspectionLaneOverrideEndAt: Date | null;
}) {
  const [open, setOpen] = useState(false);
  const [lane, setLane] = useState<InspectionLane | "">("");
  const [startAt, setStartAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endAt, setEndAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const hasOverride = !!inspectionLaneOverrideEndAt;

  const submit = async () => {
    if (!lane) { toast.error("Chọn luồng muốn ghi đè"); return; }
    if (!endAt) { toast.error("Chọn ngày kết thúc"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionLaneOverride: { lane, startAt, endAt } }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã ghi đè luồng kiểm tra");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOverride = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelInspectionLaneOverride: true }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã huỷ ghi đè — luồng trả về đúng giá trị hệ thống");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setLane(""); setStartAt(format(new Date(), "yyyy-MM-dd")); setEndAt(""); } }}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" title="Ghi đè luồng kiểm tra" />}>
        <Flag className="w-3.5 h-3.5" />
        <span className="sr-only">Ghi đè luồng kiểm tra</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ghi đè luồng kiểm tra — {userName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">Luồng hiện tại:</span>
            {inspectionLane ? (
              <Badge className={INSPECTION_LANE_COLORS[inspectionLane]}>{INSPECTION_LANE_LABELS[inspectionLane]}</Badge>
            ) : (
              <span className="text-text-muted">Chưa có</span>
            )}
          </div>

          {hasOverride && (
            <div className="rounded-lg border border-warning-light bg-warning-light/40 p-3 space-y-2">
              <p className="text-sm text-warning-foreground">
                Đang ghi đè <b>{inspectionLaneOverride ? INSPECTION_LANE_LABELS[inspectionLaneOverride] : ""}</b> từ{" "}
                {inspectionLaneOverrideStartAt ? format(inspectionLaneOverrideStartAt, "dd/MM/yyyy", { locale: vi }) : "?"} đến{" "}
                {inspectionLaneOverrideEndAt ? format(inspectionLaneOverrideEndAt, "dd/MM/yyyy", { locale: vi }) : "?"}.
              </p>
              <Button size="sm" variant="outline" className="text-destructive" disabled={submitting} onClick={cancelOverride}>
                {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1.5" />}
                Huỷ ghi đè
              </Button>
            </div>
          )}

          <div className="space-y-3 pt-1 border-t">
            <p className="text-xs text-text-muted pt-2">
              {hasOverride ? "Cài ghi đè mới sẽ thay thế ghi đè đang có." : "Ngoài khoảng ngày đã chọn, luồng tự trả về đúng giá trị hệ thống tính hàng tháng."}
            </p>
            <div className="space-y-1">
              <Label>Luồng muốn ghi đè</Label>
              <Select items={INSPECTION_LANE_LABELS} value={lane || null} onValueChange={(v) => setLane(v as InspectionLane)}>
                <SelectTrigger><SelectValue placeholder="Chọn luồng" /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(INSPECTION_LANE_LABELS) as [InspectionLane, string][]).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Từ ngày</Label>
                <Input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Đến ngày</Label>
                <Input type="date" min={startAt} value={endAt} onChange={(e) => setEndAt(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Đóng</Button>
          <Button className="bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Ghi đè
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
