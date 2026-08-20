"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Send, Check, ChevronDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Item = { id: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number };
type Handover = {
  id: string; code: string; status: "PENDING" | "CONFIRMED";
  createdByName: string; createdAt: string; confirmedByName: string | null; confirmedAt: string | null;
  items: Item[];
};

function ItemsTable({ items }: { items: Item[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-divider">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light">
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã cây</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Tên cây</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Quy cách</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Số lượng</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-divider last:border-0 even:bg-background">
              <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">{it.plantTypeCode}</td>
              <td className="px-3 py-2 text-foreground">{it.plantTypeName}</td>
              <td className="px-3 py-2 text-foreground">{it.stageCode}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{it.quantity.toLocaleString("vi-VN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReplantHandoverBoard({ canCreate }: { canCreate: boolean }) {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [eligible, setEligible] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/replant-handovers");
      const data = await res.json();
      setHandovers(Array.isArray(data.handovers) ? data.handovers : []);
      setEligible(Array.isArray(data.eligible) ? data.eligible : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createHandover = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/replant-handovers", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã tạo phiếu bàn giao ${json.code} — chờ Nhân viên sản xuất xác nhận`);
      load();
    } finally {
      setCreating(false);
    }
  };

  const confirm = async (id: string) => {
    setConfirmingId(id);
    try {
      const res = await fetch(`/api/replant-handovers/${id}`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhận bàn giao");
      load();
    } finally {
      setConfirmingId(null);
    }
  };

  const openHandover = handovers.find((h) => h.id === openId) ?? null;
  const pendingCount = handovers.filter((h) => h.status === "PENDING").length;

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  return (
    <div className="space-y-6">
      {canCreate && (
        <Card>
          <CardHeader><CardTitle className="text-primary-strong font-bold">Đề xuất Trồng lại đã duyệt, chưa bàn giao</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {eligible.length === 0 ? (
              <p className="text-sm text-text-muted flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Không có đề xuất Trồng lại nào đang chờ bàn giao.
              </p>
            ) : (
              <>
                <ItemsTable items={eligible} />
                <div className="flex justify-center pt-2">
                  <Button size="lg" className="bg-primary hover:bg-primary-hover" disabled={creating} onClick={createHandover}>
                    {creating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                    Bàn giao
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-strong font-bold">Danh sách phiếu bàn giao</CardTitle>
          <p className="text-sm text-text-muted">
            {handovers.length} phiếu{pendingCount > 0 && <span className="text-warning-foreground font-medium"> · {pendingCount} chờ xác nhận</span>}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã phiếu</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Kho mô bàn giao</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Ngày bàn giao</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Trạng thái</th>
                  <th className="px-3 py-2 font-bold text-base"></th>
                </tr>
              </thead>
              <tbody>
                {handovers.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-text-muted">Chưa có phiếu nào</td></tr>
                ) : handovers.map((h) => (
                  <tr key={h.id} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                    <td className="px-3 py-2 font-mono text-xs text-info-foreground">{h.code}</td>
                    <td className="px-3 py-2 text-foreground">{h.createdByName}</td>
                    <td className="px-3 py-2 text-foreground">{format(new Date(h.createdAt), "dd/MM/yyyy", { locale: vi })}</td>
                    <td className="px-3 py-2">
                      <Badge variant={h.status === "CONFIRMED" ? "completed" : "in-progress"}>
                        {h.status === "CONFIRMED" ? "Đã xác nhận" : "Chờ xác nhận"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button type="button" size="sm" variant="outline" onClick={() => setOpenId(h.id)}>
                          <ChevronDown className="w-3.5 h-3.5 mr-1" /> Xem
                        </Button>
                        {!canCreate && h.status === "PENDING" && (
                          <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground" disabled={confirmingId === h.id} onClick={() => confirm(h.id)}>
                            {confirmingId === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" /> Xác nhận</>}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!openHandover} onOpenChange={(open) => { if (!open) setOpenId(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chi tiết phiếu {openHandover?.code}</DialogTitle>
          </DialogHeader>
          {openHandover && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                {openHandover.status === "CONFIRMED"
                  ? `${openHandover.confirmedByName} đã xác nhận lúc ${format(new Date(openHandover.confirmedAt!), "HH:mm dd/MM/yyyy", { locale: vi })}`
                  : "Đang chờ Nhân viên sản xuất xác nhận"}
              </p>
              <ItemsTable items={openHandover.items} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
