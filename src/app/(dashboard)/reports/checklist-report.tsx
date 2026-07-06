"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ROLE_LABELS } from "@/types";
import type { UserRole } from "@prisma/client";

type Row = {
  userId: string;
  userName: string;
  role: UserRole;
  total: number;
  completed: number;
  percent: number;
  thresholdPercent: number;
  belowThreshold: boolean;
};

export default function ChecklistReport() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/checklist-report?date=${d}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const belowCount = rows.filter((r) => r.belowThreshold).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Hoàn thành checklist theo ngày</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                {rows.length} nhân viên có đầu việc {belowCount > 0 && <span className="text-red-600 font-medium">· {belowCount} chưa đạt ngưỡng</span>}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ngày</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Không có đầu việc nào được giao trong ngày này</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-green-700 text-left text-white">
                    <th className="py-2 pr-4">Nhân viên</th>
                    <th className="py-2 pr-4">Vai trò</th>
                    <th className="py-2 pr-4">Hoàn thành</th>
                    <th className="py-2 pr-4">Tỉ lệ</th>
                    <th className="py-2 pr-4">Ngưỡng</th>
                    <th className="py-2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId} className={`border-b last:border-0 ${r.belowThreshold ? "bg-red-50" : "even:bg-green-50 hover:bg-green-100"}`}>
                      <td className="py-2 pr-4 font-medium">{r.userName}</td>
                      <td className="py-2 pr-4 text-gray-500">{ROLE_LABELS[r.role]}</td>
                      <td className="py-2 pr-4">{r.completed}/{r.total}</td>
                      <td className="py-2 pr-4 font-medium">{r.percent}%</td>
                      <td className="py-2 pr-4 text-gray-500">{r.thresholdPercent}%</td>
                      <td className="py-2">
                        {r.belowThreshold ? (
                          <Badge className="bg-red-100 text-red-700 gap-1">
                            <AlertTriangle className="w-3 h-3" /> Không đạt
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700">Đạt</Badge>
                        )}
                      </td>
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
