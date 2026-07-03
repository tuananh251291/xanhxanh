"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sprout, Loader2 } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { vi } from "date-fns/locale";
import { MOTHER_SPEC_LABELS } from "@/types";

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

const MILESTONES = [
  { value: "due", label: "Đã đến hạn" },
  { value: "3d", label: "Đến hạn trong 3 ngày tới" },
  { value: "7d", label: "Đến hạn trong 7 ngày tới" },
  { value: "all", label: "Tất cả (có hạn cấy chuyển)" },
] as const;

function statusBadge(daysLeft: number) {
  if (daysLeft < 0) return <Badge className="bg-red-100 text-red-700">Quá hạn {Math.abs(daysLeft)} ngày</Badge>;
  if (daysLeft === 0) return <Badge className="bg-orange-100 text-orange-700">Đến hạn hôm nay</Badge>;
  return <Badge className="bg-gray-100 text-gray-600">Còn {daysLeft} ngày</Badge>;
}

export default function MotherReadyBoard() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [milestone, setMilestone] = useState<string>("due");

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

  const filtered = useMemo(() => {
    const today = new Date();
    return lots
      .map((l) => ({ ...l, daysLeft: differenceInCalendarDays(new Date(l.expectedMoveAt!), today) }))
      .filter((l) => {
        if (milestone === "due") return l.daysLeft <= 0;
        if (milestone === "3d") return l.daysLeft <= 3;
        if (milestone === "7d") return l.daysLeft <= 7;
        return true;
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [lots, milestone]);

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

      <div className="flex items-center gap-2">
        <Select value={milestone} onValueChange={(v) => setMilestone(v as string)}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MILESTONES.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">{filtered.length} lô</span>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Không có lô mẫu mẹ nào khớp mốc thời gian đã chọn</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Mã lô</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Loại cây</th>
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
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <span className="font-mono text-xs text-gray-500 mr-1">{l.plantType.code}</span>{l.plantType.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{MOTHER_SPEC_LABELS[l.stageCode as keyof typeof MOTHER_SPEC_LABELS] ?? l.stageCode}</Badge>
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
