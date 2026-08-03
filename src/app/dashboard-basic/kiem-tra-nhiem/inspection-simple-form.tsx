"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Moon, Loader2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { getInspectionDueAt } from "@/lib/inspection";

type Lot = {
  id: string;
  code: string;
  stageCode: string;
  quantity: number;
  initialQuantity: number;
  plantType: { name: string; code: string };
  enteredAt: string;
  inspectedAt: string | null;
};

function InspectionGroupCard({ group, onDone }: { group: Lot[]; onDone: () => void }) {
  const [contaminated, setContaminated] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Dùng lot.quantity (tồn HIỆN TẠI) chứ không phải lot.initialQuantity (số lúc lô mới tạo, đứng yên
  // vĩnh viễn dù sau đó Nhập kho thủ công cộng thêm nhiều lần) — xem chú thích tương tự ở my-dark-room.
  const rows = group.map((lot) => {
    const value = parseInt(contaminated[lot.id] ?? "0") || 0;
    const passed = Math.max(0, lot.quantity - value);
    return { lot, value, passed };
  });

  const submit = async () => {
    for (const r of rows) {
      if (r.value > r.lot.quantity) {
        toast.error(`Số nhiễm của ${r.lot.stageCode} vượt quá tổng số`);
        return;
      }
    }
    const ok = window.confirm(`Xác nhận đã kiểm tra xong lô ${group[0].code}?`);
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/lot-inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: group.map((lot) => ({ lotId: lot.id, contaminatedQuantity: parseInt(contaminated[lot.id] ?? "0") || 0 })),
        }),
      });
      if (!res.ok) {
        toast.error((await res.json()).message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success(`Đã kiểm tra xong lô ${group[0].code}`);
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-2 border-primary-light">
      <CardContent className="py-5 space-y-4">
        <p className="text-sm text-text-secondary">
          Lô sản phẩm <span className="font-mono font-bold text-info-foreground">{group[0].code}</span>
        </p>

        <div className="divide-y divide-divider">
          {rows.map(({ lot, passed }) => (
            <div key={lot.id} className="py-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground font-medium">
                  {lot.stageCode} · <span className="font-mono">{lot.plantType.code}</span> — {lot.plantType.name}
                </span>
                <span className="text-text-secondary">Tổng: {lot.quantity.toLocaleString("vi-VN")}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-text-secondary shrink-0">Số lượng nhiễm</label>
                <Input
                  type="number"
                  min={0}
                  max={lot.quantity}
                  value={contaminated[lot.id] ?? ""}
                  onChange={(e) => setContaminated((prev) => ({ ...prev, [lot.id]: e.target.value }))}
                  placeholder="0"
                  className="w-24 text-right"
                />
              </div>
              <p className="text-xs text-text-secondary text-right">Đạt: {passed.toLocaleString("vi-VN")}</p>
            </div>
          ))}
        </div>

        <Button className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
          Kiểm tra xong
        </Button>
      </CardContent>
    </Card>
  );
}

export default function InspectionSimpleForm() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lots?roomType=PHONG_TOI&status=ACTIVE");
      const data = await res.json();
      setLots(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => load());
  }, [load]);

  // Nhóm theo CẢ mã lẫn ngày nhập thật (không chỉ mã) — mã lô không đảm bảo duy nhất theo ngày, nếu chỉ
  // nhóm theo mã sẽ gộp nhầm lô khác ngày (VD 1 lô đã kiểm tra + 1 lô chưa) vào chung 1 phiếu, khiến
  // API chặn cứng cả nhóm (xem cùng lỗi đã sửa ở my-dark-room/page.tsx).
  const byCode = lots.reduce<Record<string, Lot[]>>((acc, lot) => {
    const key = `${lot.code}__${lot.enteredAt.slice(0, 10)}`;
    (acc[key] ??= []).push(lot);
    return acc;
  }, {});

  const now = new Date();
  const dueGroups = Object.values(byCode).filter((group) => {
    const allInspected = group.every((l) => l.inspectedAt);
    if (allInspected) return false;
    return now >= getInspectionDueAt(new Date(group[0].enteredAt));
  });

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (dueGroups.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-text-muted">
          <Moon className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có lô nào cần kiểm tra nhiễm hôm nay</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {dueGroups.map((group) => (
        <InspectionGroupCard key={`${group[0].code}__${group[0].enteredAt.slice(0, 10)}`} group={group} onDone={load} />
      ))}
    </div>
  );
}
