"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Moon, Loader2, Send, ClipboardCheck, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { getInspectionDueAt } from "@/lib/inspection";

type Lot = {
  id: string;
  code: string;
  stage: "MAU_ME" | "THANH_PHAM";
  stageCode: string;
  quantity: number;
  initialQuantity: number;
  status: string;
  plantType: { name: string; code: string };
  shelf?: { name: string; warehouse: { name: string } } | null;
  _count: { contaminations: number };
  enteredAt: string;
  inspectedAt: string | null;
};

function InspectionDialog({ group, onDone, disabled }: { group: Lot[]; onDone: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [contaminated, setContaminated] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const rows = group.map((lot) => {
    const value = parseInt(contaminated[lot.id] ?? "0") || 0;
    const passed = Math.max(0, lot.initialQuantity - value);
    return { lot, value, passed };
  });
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.lot.initialQuantity,
      contaminated: acc.contaminated + r.value,
      passed: acc.passed + r.passed,
    }),
    { total: 0, contaminated: 0, passed: 0 },
  );

  const submit = async () => {
    for (const r of rows) {
      if (r.value > r.lot.initialQuantity) { toast.error(`Số nhiễm của ${r.lot.stageCode} vượt quá tổng số`); return; }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/lot-inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: group.map((lot) => ({ lotId: lot.id, contaminatedQuantity: parseInt(contaminated[lot.id] ?? "0") || 0 })),
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã kiểm tra xong lô ${group[0].code}`);
      setOpen(false);
      setContaminated({});
      onDone();
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        className="bg-primary hover:bg-primary-hover text-xs disabled:opacity-40 disabled:pointer-events-none"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <ClipboardCheck className="w-3.5 h-3.5 mr-1" /> Kiểm tra
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Phiếu kiểm tra nhiễm — lô {group[0].code}</DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b">
                <th className="py-1.5 pr-2 font-bold text-base">Quy cách</th>
                <th className="py-1.5 px-2 text-right font-bold text-base">Tổng</th>
                <th className="py-1.5 px-2 text-right font-bold text-base">Nhiễm</th>
                <th className="py-1.5 pl-2 text-right font-bold text-base">Đạt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ lot, passed }) => (
                <tr key={lot.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">{lot.stageCode}</td>
                  <td className="py-1.5 px-2 text-right">{lot.initialQuantity.toLocaleString("vi-VN")}</td>
                  <td className="py-1.5 px-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      max={lot.initialQuantity}
                      value={contaminated[lot.id] ?? ""}
                      onChange={(e) => setContaminated((prev) => ({ ...prev, [lot.id]: e.target.value }))}
                      placeholder="0"
                      className="h-8 w-24 text-sm ml-auto"
                    />
                  </td>
                  <td className="py-1.5 pl-2 text-right font-medium">{passed.toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-1.5 pr-2">Tổng cộng</td>
                <td className="py-1.5 px-2 text-right">{totals.total.toLocaleString("vi-VN")}</td>
                <td className="py-1.5 px-2 text-right">{totals.contaminated.toLocaleString("vi-VN")}</td>
                <td className="py-1.5 pl-2 text-right">{totals.passed.toLocaleString("vi-VN")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-text-secondary border-t pt-2">
          Tôi xác nhận đã kiểm tra kĩ, ghi nhận số liệu chính xác theo thực tế.
        </p>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
          <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Kiểm tra xong
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductLotGroup({ group, onUpdated, selected, onToggleSelect }: {
  group: Lot[];
  onUpdated: () => void;
  selected: Record<string, boolean>;
  onToggleSelect: (lotId: string, checked: boolean) => void;
}) {
  const allInspected = group.every((l) => l.inspectedAt);
  const enteredAt = new Date(group[0].enteredAt);
  const dueAt = getInspectionDueAt(enteredAt);
  const now = new Date();
  const canInspect = now >= dueAt;
  const daysLeft = Math.max(1, Math.ceil((dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <Card className="max-w-2xl">
      <CardContent className="py-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span>Lô sản phẩm <span className="font-mono font-bold text-info-foreground">{group[0].code}</span></span>
              {allInspected ? (
                <span className="text-primary-strong font-medium">Đã kiểm tra</span>
              ) : canInspect ? (
                <span className="text-destructive font-medium">Trễ lịch kiểm tra</span>
              ) : (
                <span className="text-warning-foreground">
                  Còn <span className="font-bold text-destructive text-base">{daysLeft}</span> ngày nữa đến lịch kiểm tra
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-secondary border-b">
                    <th className="py-1.5 pr-3 w-6 font-bold text-base"></th>
                    <th className="py-1.5 pr-10 font-bold text-base">Mã cây</th>
                    <th className="py-1.5 pr-10 font-bold text-base">Tên cây chi tiết</th>
                    <th className="py-1.5 pr-10 font-bold text-base">Quy cách</th>
                    <th className="py-1.5 pl-2 text-right font-bold text-base">Số lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((lot) => {
                    const inspected = !!lot.inspectedAt;
                    return (
                      <tr key={lot.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-3">
                          {inspected ? (
                            <Checkbox checked={!!selected[lot.id]} onCheckedChange={(v) => onToggleSelect(lot.id, v === true)} />
                          ) : (
                            <span title="Cần kiểm tra nhiễm trước khi bàn giao" className="text-text-muted">
                              <Lock className="w-4 h-4" />
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-10 font-mono">{lot.plantType.code}</td>
                        <td className="py-1.5 pr-10">{lot.plantType.name}</td>
                        <td className="py-1.5 pr-10">{lot.stageCode}</td>
                        <td className="py-1.5 pl-2 text-right">{lot.quantity.toLocaleString("vi-VN")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <InspectionDialog group={group} onDone={onUpdated} disabled={allInspected || !canInspect} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyDarkRoomPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadLots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lots?roomType=PHONG_TOI&status=ACTIVE");
      if (res.ok) {
        const data = await res.json();
        setLots(data);
        setSelected({});
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLots(); }, [loadLots]);

  const byCode = lots.reduce<Record<string, Lot[]>>((acc, lot) => {
    (acc[lot.code] ??= []).push(lot);
    return acc;
  }, {});

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const submitHandoff = async () => {
    if (selectedIds.length === 0) { toast.error("Chọn ít nhất 1 lô để bàn giao"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedIds.map((id) => {
            const lot = lots.find((l) => l.id === id)!;
            return { lotId: id, quantity: lot.quantity };
          }),
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã gửi phiếu bàn giao ${selectedIds.length} lô cho Kho mô`);
      loadLots();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Moon className="w-6 h-6 text-primary-strong" /> Phòng tối cá nhân
        </h1>
        <p className="text-text-secondary text-sm mt-1">Quản lý lô mô đang trong phòng tối — kiểm tra nhiễm, bàn giao cho Kho mô</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : lots.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <Moon className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có lô nào trong phòng tối</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(byCode).map(([code, group]) => (
            <ProductLotGroup
              key={code}
              group={group}
              onUpdated={loadLots}
              selected={selected}
              onToggleSelect={(lotId, checked) => setSelected((prev) => ({ ...prev, [lotId]: checked }))}
            />
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-wrap items-center justify-between gap-2 border-t bg-white p-3 shadow-lg">
          <p className="min-w-0 text-sm text-text-secondary">Đã chọn <strong>{selectedIds.length}</strong> lô để bàn giao cho Kho mô</p>
          <Button className="w-full bg-primary hover:bg-primary-hover sm:w-auto" onClick={submitHandoff} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Bàn giao cho Kho mô
          </Button>
        </div>
      )}
    </div>
  );
}
