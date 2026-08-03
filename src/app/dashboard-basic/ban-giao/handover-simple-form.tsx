"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Loader2, PackageCheck, Info } from "lucide-react";
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

  // Nhóm theo CẢ mã lẫn ngày nhập thật (không chỉ mã) — mã lô không đảm bảo duy nhất theo ngày (công cụ
  // nhập liệu có thể tạo trùng mã cho 2 lô nhập 2 ngày khác nhau). Nếu chỉ nhóm theo mã, 2 lô khác ngày
  // trùng mã bị gộp chung 1 nhóm — hễ 1 trong 2 lô chưa kiểm tra nhiễm là cả nhóm bị loại khỏi danh sách
  // "cần bàn giao" dù lô còn lại đã sẵn sàng thật (xem cùng lỗi đã sửa ở my-dark-room/page.tsx).
  const byCode = lots.reduce<Record<string, Lot[]>>((acc, lot) => {
    const key = `${lot.code}__${lot.enteredAt.slice(0, 10)}`;
    (acc[key] ??= []).push(lot);
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

  return (
    <div className="space-y-4">
      <div className="text-sm text-info-foreground bg-info-light rounded-lg p-3 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Trang này KHÔNG có ô &quot;Không đạt&quot; — tính năng cho phép tự khai số cây thành phẩm chưa đạt chuẩn lúc
          bàn giao (có ở trang &quot;Bàn giao sản phẩm&quot; của Giao diện nâng cao) chưa được đưa vào bản rút gọn.
          Toàn bộ số lượng lô sẽ được ghi nhận nguyên vẹn khi bàn giao qua trang này — nếu có cây không đạt cần khai
          báo, hãy dùng trang &quot;Bàn giao sản phẩm&quot; của Giao diện nâng cao thay vì trang này.
        </p>
      </div>

      {readyGroups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-text-muted">
            <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
            <p>Không có lô nào cần bàn giao hôm nay</p>
          </CardContent>
        </Card>
      ) : (
        readyGroups.map((group) => (
          <HandoverGroupCard key={`${group[0].code}__${group[0].enteredAt.slice(0, 10)}`} group={group} onHandedOver={load} />
        ))
      )}
    </div>
  );
}
