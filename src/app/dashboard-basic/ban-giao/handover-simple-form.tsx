"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";

type Lot = {
  id: string;
  code: string;
  stageCode: string;
  quantity: number;
  plantType: { name: string; code: string };
  enteredAt: string;
  inspectedAt: string | null;
};

const MIN_DAYS_SINCE_PLANTED = 7;

function HandoverGroupCard({ group, onHandedOver }: { group: Lot[]; onHandedOver: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const daysSince = differenceInCalendarDays(new Date(), new Date(group[0].enteredAt));

  const submit = async () => {
    const ok = window.confirm(`Xác nhận bàn giao lô ${group[0].code} sang kho sáng?`);
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: group.map((lot) => ({ lotId: lot.id, quantity: lot.quantity })),
        }),
      });
      if (!res.ok) {
        toast.error((await res.json()).message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success(`Đã bàn giao lô ${group[0].code} sang kho sáng`);
      onHandedOver();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-2 border-primary-light">
      <CardContent className="py-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            Lô sản phẩm <span className="font-mono font-bold text-info-foreground">{group[0].code}</span>
          </p>
          <span className="text-xs text-text-secondary whitespace-nowrap">Đã cấy {daysSince} ngày</span>
        </div>

        <div className="divide-y divide-divider">
          {group.map((lot) => (
            <div key={lot.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-foreground">
                {lot.stageCode} · <span className="font-mono">{lot.plantType.code}</span> — {lot.plantType.name}
              </span>
              <span className="font-semibold text-foreground">{lot.quantity.toLocaleString("vi-VN")}</span>
            </div>
          ))}
        </div>

        <Button className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Bàn giao sang kho sáng
        </Button>
      </CardContent>
    </Card>
  );
}

export default function HandoverSimpleForm() {
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

  const byCode = lots.reduce<Record<string, Lot[]>>((acc, lot) => {
    (acc[lot.code] ??= []).push(lot);
    return acc;
  }, {});

  const readyGroups = Object.values(byCode).filter(
    (group) =>
      group.every((l) => l.inspectedAt) &&
      differenceInCalendarDays(new Date(), new Date(group[0].enteredAt)) >= MIN_DAYS_SINCE_PLANTED
  );

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (readyGroups.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-text-muted">
          <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có lô nào cần bàn giao hôm nay</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {readyGroups.map((group) => (
        <HandoverGroupCard key={group[0].code} group={group} onHandedOver={load} />
      ))}
    </div>
  );
}
