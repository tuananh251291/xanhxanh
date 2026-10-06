"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABELS, type UserRole } from "@/types";
import type { AttendanceRequestStatus } from "@prisma/client";
import {
  ATTENDANCE_REQUEST_TYPE_LABELS,
  DayDetailDialog,
  RequestStatusBadge,
  describeRequest,
  fmtDateKey,
  type RequestLike,
} from "../attendance-shared";

type Row = RequestLike & {
  id: string;
  status: AttendanceRequestStatus;
  reason: string;
  managerNote: string | null;
  hrNote: string | null;
  createdAt: string;
  user: { id: string; name: string; code: string; role: UserRole | null; workplaceWarehouse: { name: string } | null };
  manager: { name: string } | null;
  hr: { name: string } | null;
};

export default function ApprovalsBoard({ isHr }: { isHr: boolean }) {
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<{ row: Row; action: "APPROVE" | "REJECT" } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<{ userId: string; userName: string; date: string } | null>(null);

  // Không tự bật loading ở đây (gọi từ effect) — chỗ đổi bộ lọc tự bật.
  const load = useCallback(async () => {
    try {
      const qs = filter === "pending" ? "status=pending" : `status=all&month=${month}`;
      const res = await fetch(`/api/attendance/requests?${qs}`);
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Không tải được danh sách"); return; }
      setRows(json.requests);
    } finally {
      setLoading(false);
    }
  }, [filter, month]);

  useEffect(() => { load(); }, [load]);

  // Đơn mình được thao tác: quản lý khu → PENDING_MANAGER; HCNS → PENDING_HR.
  const canAct = (r: Row) => (r.status === "PENDING_HR" && isHr) || (r.status === "PENDING_MANAGER" && !isHr);

  const submit = async () => {
    if (!decision) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/attendance/requests/${decision.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: decision.action, note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Thao tác thất bại"); return; }
      toast.success(decision.action === "APPROVE" ? "Đã duyệt đơn" : "Đã từ chối đơn");
      setDecision(null);
      setNote("");
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-strong" /> Duyệt đơn chấm công
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {isHr ? "HCNS duyệt cấp 2 — sau khi quản lý khu đã duyệt (hoặc khu chưa có người duyệt cấp 1)." : "Bạn duyệt cấp 1 cho NV trong khu được giao — đơn được duyệt sẽ chuyển lên HCNS."}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={filter} onValueChange={(v) => { setLoading(true); setFilter(v as "pending" | "all"); }}>
          <TabsList>
            <TabsTrigger value="pending">Cần duyệt</TabsTrigger>
            <TabsTrigger value="all">Tất cả theo tháng</TabsTrigger>
          </TabsList>
        </Tabs>
        {filter === "all" && <Input type="month" value={month} onChange={(e) => { setLoading(true); setMonth(e.target.value); }} className="w-44" />}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Nhân viên</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Loại đơn</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Nội dung</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Trạng thái</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-text-muted">{filter === "pending" ? "Không có đơn nào cần duyệt 🎉" : "Không có đơn nào trong tháng"}</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="border-b border-divider last:border-0 align-top even:bg-background">
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground whitespace-nowrap">{r.user.name} <span className="text-xs text-text-muted font-mono">({r.user.code})</span></p>
                      <p className="text-xs text-text-secondary">{r.user.role ? ROLE_LABELS[r.user.role] : ""}{r.user.workplaceWarehouse ? ` · ${r.user.workplaceWarehouse.name}` : ""}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-foreground">{ATTENDANCE_REQUEST_TYPE_LABELS[r.type]}</td>
                    <td className="px-3 py-2 text-text-secondary">
                      <p>{describeRequest(r)}</p>
                      <p className="text-xs text-text-muted">Lý do: {r.reason}</p>
                      {r.managerNote && <p className="text-xs text-text-muted">Quản lý{r.manager ? ` ${r.manager.name}` : ""}: {r.managerNote}</p>}
                      {r.hrNote && <p className="text-xs text-text-muted">HCNS{r.hr ? ` ${r.hr.name}` : ""}: {r.hrNote}</p>}
                      <p className="text-xs text-text-muted">Gửi lúc {fmtDateKey(r.createdAt)}</p>
                      {(r.type === "MISSED_CHECK" || r.type === "LATE_EARLY") && (
                        <button type="button" className="text-xs text-info-foreground underline" onClick={() => setDetail({ userId: r.user.id, userName: r.user.name, date: r.startDate.slice(0, 10) })}>
                          Xem chấm công ngày này
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2"><RequestStatusBadge status={r.status} /></td>
                    <td className="px-3 py-2">
                      {canAct(r) && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => { setNote(""); setDecision({ row: r, action: "REJECT" }); }}>
                            <X className="w-3.5 h-3.5" /> Từ chối
                          </Button>
                          <Button size="sm" className="h-8" onClick={() => { setNote(""); setDecision({ row: r, action: "APPROVE" }); }}>
                            <Check className="w-3.5 h-3.5" /> Duyệt
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!decision} onOpenChange={(open) => { if (!open) setDecision(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{decision?.action === "APPROVE" ? "Duyệt đơn" : "Từ chối đơn"}</DialogTitle>
          </DialogHeader>
          {decision && (
            <div className="space-y-3 text-sm">
              <p className="text-foreground">
                <b>{decision.row.user.name}</b> — {ATTENDANCE_REQUEST_TYPE_LABELS[decision.row.type]}: {describeRequest(decision.row)}
              </p>
              <div className="space-y-1">
                <Label>{decision.action === "REJECT" ? "Lý do từ chối (bắt buộc)" : "Ghi chú (không bắt buộc)"}</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Huỷ</Button>
            <Button
              variant={decision?.action === "REJECT" ? "destructive" : "default"}
              disabled={saving || (decision?.action === "REJECT" && !note.trim())}
              onClick={submit}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {decision?.action === "APPROVE" ? "Duyệt" : "Từ chối"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DayDetailDialog target={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
