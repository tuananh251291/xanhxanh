"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sprout, Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { format, differenceInCalendarDays, startOfWeek, endOfWeek, addWeeks, isWithinInterval } from "date-fns";
import { vi } from "date-fns/locale";

type Lot = {
  id: string;
  code: string;
  quantity: number;
  stageCode: string;
  enteredAt: string;
  expectedMoveAt: string | null;
  plantType: { code: string; name: string };
  shelf: { code: string; name: string } | null;
  instruction: { code: string; assignedTo: { name: string } | null } | null;
};

function statusBadge(daysLeft: number) {
  if (daysLeft < 0) return <Badge className="bg-red-100 text-red-700">Quá hạn {Math.abs(daysLeft)} ngày</Badge>;
  if (daysLeft === 0) return <Badge className="bg-orange-100 text-orange-700">Đến hạn hôm nay</Badge>;
  return <Badge className="bg-gray-100 text-gray-600">Còn {daysLeft} ngày</Badge>;
}

const thisWeekStart = () => startOfWeek(new Date(), { weekStartsOn: 1 });

export default function MotherReadyBoard() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  // Tuần đang chọn trên bộ điều hướng (chưa áp dụng) và tuần đã áp dụng để lọc — tách riêng vì trang có
  // nút "Lọc" tường minh, bấm Trước/Sau chỉ đổi ô hiển thị, chưa lọc lại danh sách ngay.
  const [pendingWeekStart, setPendingWeekStart] = useState<Date>(thisWeekStart);
  const [appliedWeekStart, setAppliedWeekStart] = useState<Date>(thisWeekStart);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lots?stage=MAU_ME&roomType=PHONG_MAU_ME&status=ACTIVE");
      const data = await res.json();
      setLots(Array.isArray(data) ? data.filter((l: Lot) => l.expectedMoveAt) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const appliedWeekEnd = endOfWeek(appliedWeekStart, { weekStartsOn: 1 });
  const pendingWeekEnd = endOfWeek(pendingWeekStart, { weekStartsOn: 1 });

  const filtered = useMemo(() => {
    const today = new Date();
    return lots
      .map((l) => ({ ...l, daysLeft: differenceInCalendarDays(new Date(l.expectedMoveAt!), today) }))
      .filter((l) => isWithinInterval(new Date(l.expectedMoveAt!), { start: appliedWeekStart, end: appliedWeekEnd }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [lots, appliedWeekStart, appliedWeekEnd]);

  const applyFilter = () => setAppliedWeekStart(pendingWeekStart);
  const shiftPendingWeek = (delta: number) => setPendingWeekStart((prev) => addWeeks(prev, delta));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sprout className="w-6 h-6 text-emerald-600" /> Mẫu mẹ đến tuổi cấy chuyển
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Danh sách lô mẫu mẹ trong kho sáng theo thời gian đợi cấy chuyển đã cài đặt cho từng loại cây
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-sm font-medium">Chọn thời gian</Label>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center border rounded-lg bg-white">
            <Button type="button" variant="ghost" size="sm" onClick={() => shiftPendingWeek(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm px-2 whitespace-nowrap">
              Tuần {format(pendingWeekStart, "dd/MM/yyyy", { locale: vi })} – {format(pendingWeekEnd, "dd/MM/yyyy", { locale: vi })}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => shiftPendingWeek(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPendingWeekStart(thisWeekStart())}>
            Tuần này
          </Button>
          <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={applyFilter}>
            <Search className="w-4 h-4 mr-1" /> Tìm kiếm
          </Button>
          <span className="text-sm text-gray-500">
            Đang xem tuần {format(appliedWeekStart, "dd/MM/yyyy", { locale: vi })} – {format(appliedWeekEnd, "dd/MM/yyyy", { locale: vi })} · {filtered.length} lô
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Không có lô mẫu mẹ nào đến hạn cấy chuyển trong tuần đã chọn</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Mã lô</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Tên cây</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Quy cách</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Số lượng</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Kệ</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">NV phụ trách</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Hạn cấy chuyển</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-blue-700">{l.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{l.plantType.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{l.stageCode}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{l.quantity.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{l.shelf?.code ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{l.instruction?.assignedTo?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {l.expectedMoveAt ? format(new Date(l.expectedMoveAt), "dd/MM/yyyy", { locale: vi }) : "—"}
                      </td>
                      <td className="px-4 py-3">{statusBadge(l.daysLeft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
