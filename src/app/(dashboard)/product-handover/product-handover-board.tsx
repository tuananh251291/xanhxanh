"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

function ProductLotTable({ group, onHandedOver }: { group: Lot[]; onHandedOver: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allInspected = group.every((l) => l.inspectedAt);
  const daysSince = differenceInCalendarDays(new Date(), new Date(group[0].enteredAt));

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: group.map((lot) => ({ lotId: lot.id, quantity: lot.quantity })),
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã bàn giao lô ${group[0].code} sang kho sáng`);
      onHandedOver();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5" /> Lô sản phẩm <span className="font-mono">{group[0].code}</span>
          </CardTitle>
          <span className="text-sm text-text-secondary whitespace-nowrap">Đã cấy {daysSince} ngày</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Mã cây</th>
                <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Tên cây chi tiết</th>
                <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Quy cách</th>
                <th className="text-right px-4 py-2 text-primary-strong font-bold text-base">Số lượng</th>
              </tr>
            </thead>
            <tbody>
              {group.map((lot) => (
                <tr key={lot.id} className="border-b last:border-0 even:bg-primary-light">
                  <td className="px-4 py-2 font-mono">{lot.plantType.code}</td>
                  <td className="px-4 py-2">{lot.plantType.name}</td>
                  <td className="px-4 py-2">{lot.stageCode}</td>
                  <td className="px-4 py-2 text-right font-medium">{lot.quantity.toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {allInspected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-divider">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
              Tôi đã xác nhận thông tin chính xác
            </label>
            <Button
              className="bg-primary hover:bg-primary-hover"
              disabled={!confirmed || submitting}
              onClick={submit}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Bàn giao sang kho sáng
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-divider">
            <span className="text-sm text-warning-foreground">Cần kiểm tra nhiễm trước khi bàn giao</span>
            <Link href="/my-dark-room">
              <Button variant="outline" size="sm">Đi kiểm tra nhiễm</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProductHandoverBoard() {
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

  useEffect(() => { load(); }, [load]);

  const byCode = lots.reduce<Record<string, Lot[]>>((acc, lot) => {
    (acc[lot.code] ??= []).push(lot);
    return acc;
  }, {});

  const groups = Object.values(byCode).filter(
    (group) => differenceInCalendarDays(new Date(), new Date(group[0].enteredAt)) >= MIN_DAYS_SINCE_PLANTED
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Send className="w-6 h-6 text-primary-strong" /> Bàn giao sản phẩm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Các lô đã cấy từ {MIN_DAYS_SINCE_PLANTED} ngày trở lên trong phòng tối cá nhân — sẵn sàng bàn giao sang kho sáng
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <Send className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có lô nào đủ {MIN_DAYS_SINCE_PLANTED} ngày để bàn giao</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <ProductLotTable key={group[0].code} group={group} onHandedOver={load} />
          ))}
        </div>
      )}
    </div>
  );
}
