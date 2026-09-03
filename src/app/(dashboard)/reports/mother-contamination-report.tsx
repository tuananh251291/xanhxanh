"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StaffMultiFilter from "@/components/shared/staff-multi-filter";
import { Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import { vi } from "date-fns/locale";
import { INSTRUCTION_STATUS_LABELS } from "@/types";
import type { InstructionStatus } from "@prisma/client";

type Staff = { id: string; name: string; code: string };
type Row = {
  instructionId: string;
  code: string;
  status: InstructionStatus;
  weekStart: string | null;
  staffId: string | null;
  staffName: string | null;
  staffCode: string | null;
  inputMotherQuantity: number;
  totalChecked: number;
  totalContaminated: number;
  ratePct: number;
};
type Summary = { totalContaminated: number; totalInput: number; overallRatePct: number; instructionCount: number };

export default function MotherContaminationReport() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: { id: string; name: string; code: string; role: string }[]) => {
        setStaffList(
          (Array.isArray(data) ? data : [])
            .filter((u) => u.role === "CAY_MO")
            .map((u) => ({ id: u.id, name: u.name, code: u.code }))
        );
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (selectedStaffIds.length > 0) params.set("staffIds", selectedStaffIds.join(","));
      const res = await fetch(`/api/reports/mother-contamination?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [selectedStaffIds, from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Tỉ lệ nhiễm mẫu mẹ bàn giao</CardTitle>
            <p className="text-sm text-text-secondary mt-1">
              Nhiễm mẫu mẹ đầu vào phát hiện lúc NV cấy mô kiểm tra hàng ngày, tính cộng dồn theo từng chỉ định (chốt số khi chỉ định kết thúc)
            </p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Nhân viên</Label>
              <StaffMultiFilter staffList={staffList} selectedIds={selectedStaffIds} onChange={setSelectedStaffIds} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Từ ngày</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Đến ngày</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
        </div>
        {summary && (
          <p className="text-sm text-text-secondary mt-2">
            {summary.instructionCount} chỉ định · Tổng mẫu mẹ nhiễm: <strong className="text-destructive">{summary.totalContaminated.toLocaleString("vi-VN")}</strong>
            {" "}/ {summary.totalInput.toLocaleString("vi-VN")} · Tỉ lệ chung: <strong>{summary.overallRatePct}%</strong>
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">Không có chỉ định nào trong khoảng thời gian này</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light text-left text-primary-strong">
                  <th className="py-2 px-3 font-bold text-base">Chỉ định</th>
                  <th className="py-2 px-3 font-bold text-base">NV cấy mô</th>
                  <th className="py-2 px-3 font-bold text-base">Tuần</th>
                  <th className="py-2 px-3 font-bold text-base">Trạng thái</th>
                  <th className="py-2 px-3 font-bold text-base text-right">MM được cấp</th>
                  <th className="py-2 px-3 font-bold text-base text-right">MM nhiễm</th>
                  <th className="py-2 px-3 font-bold text-base text-right">Tỉ lệ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.instructionId} className="border-b last:border-0 even:bg-primary-light/30">
                    <td className="py-2 px-3 font-mono text-info-foreground">{r.code}</td>
                    <td className="py-2 px-3">{r.staffName ? `${r.staffName} (${r.staffCode})` : "—"}</td>
                    <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                      {r.weekStart ? format(new Date(r.weekStart), "dd/MM/yyyy", { locale: vi }) : "—"}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant="secondary">{INSTRUCTION_STATUS_LABELS[r.status] ?? r.status}</Badge>
                    </td>
                    <td className="py-2 px-3 text-right">{r.inputMotherQuantity.toLocaleString("vi-VN")}</td>
                    <td className="py-2 px-3 text-right text-destructive font-medium">{r.totalContaminated.toLocaleString("vi-VN")}</td>
                    <td className="py-2 px-3 text-right font-bold">{r.ratePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
