"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format, addWeeks, startOfWeek } from "date-fns";
import { vi } from "date-fns/locale";

const STAGE_CODES = ["M05", "T05", "T01"] as const;
const ALL_STAFF = "ALL";

type Staff = { id: string; name: string; code: string };

type Row = {
  key: string;
  instructionCode: string;
  plantTypeCode: string | null;
  plantTypeName: string | null;
  staffName: string | null;
  contaminatedByStage: Record<string, number>;
  initialTotal: number;
  contaminatedTotal: number;
  contaminationRatePct: number;
};
type Summary = { initialTotal: number; contaminatedTotal: number; ratePct: number };

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Báo cáo "nhiễm sau ủ tối" theo tuần — danh sách chỉ định cấy, số lượng nhiễm theo từng quy cách
// (NV cấy mô TỰ kiểm tra ngay sau khi lô đủ ngày ủ tối, xem /api/lot-inspections), % nhiễm trên tổng
// số lượng nhập kho tối của đúng chỉ định đó. Có nút chuyển tuần trước/sau, mặc định tuần hiện tại.
export default function DarkRoomContaminationByInstructionSection() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<string>(ALL_STAFF);
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

  const load = useCallback(async (ws: Date, staff: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ weekStart: format(ws, "yyyy-MM-dd") });
      if (staff !== ALL_STAFF) params.set("staffId", staff);
      const res = await fetch(`/api/reports/dark-room-contamination-by-instruction?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(weekStart, staffId); }, [weekStart, staffId, load]);

  const staffOptions = useMemo(
    () => [{ value: ALL_STAFF, label: "Toàn hệ thống" }, ...staffList.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))],
    [staffList]
  );

  const weekEnd = addWeeks(weekStart, 1);
  const weekEndDisplay = new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000);
  const isCurrentWeek = weekStart.getTime() === startOfWeek(new Date(), { weekStartsOn: 1 }).getTime();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Nhiễm sau ủ tối theo chỉ định cấy</CardTitle>
            <p className="text-sm text-text-secondary mt-1">
              NV cấy mô tự kiểm tra ngay sau khi lô đủ ngày ủ tối — số lượng nhiễm theo từng quy cách, % nhiễm trên tổng nhập kho tối
            </p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Nhân viên</Label>
              <Select items={staffOptions} value={staffId} onValueChange={(v) => setStaffId(v as string)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {staffOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium whitespace-nowrap">
              {format(weekStart, "dd/MM", { locale: vi })} – {format(weekEndDisplay, "dd/MM/yyyy", { locale: vi })}
              {isCurrentWeek && <span className="text-text-muted font-normal"> (tuần này)</span>}
            </span>
            <Button variant="outline" size="sm" disabled={isCurrentWeek} onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {summary && summary.initialTotal > 0 && (
          <p className="text-sm text-text-secondary mt-2">
            Tổng: <strong className="text-destructive">{fmt(summary.contaminatedTotal)}</strong>/{fmt(summary.initialTotal)} cụm/cây nhiễm
            {" "}(<strong>{summary.ratePct}%</strong>)
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">Không có dữ liệu kiểm tra sau ủ tối trong tuần này</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light text-left text-primary-strong">
                  <th className="py-2 px-3 font-bold text-base">Chỉ định cấy</th>
                  <th className="py-2 px-3 font-bold text-base">NV cấy mô</th>
                  {STAGE_CODES.map((c) => (
                    <th key={c} className="py-2 px-3 font-bold text-base text-right">Nhiễm {c}</th>
                  ))}
                  <th className="py-2 px-3 font-bold text-base text-right">Tổng nhập kho tối</th>
                  <th className="py-2 px-3 font-bold text-base text-right">% nhiễm</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0 even:bg-primary-light/30">
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="font-mono">{r.instructionCode}</span>
                      {r.plantTypeCode && <span className="text-text-muted"> — {r.plantTypeCode} {r.plantTypeName}</span>}
                    </td>
                    <td className="py-2 px-3 text-text-secondary">{r.staffName ?? "—"}</td>
                    {STAGE_CODES.map((c) => (
                      <td key={c} className="py-2 px-3 text-right">
                        {r.contaminatedByStage[c] > 0 ? (
                          <span className="text-destructive font-medium">{fmt(r.contaminatedByStage[c])}</span>
                        ) : "—"}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right">{fmt(r.initialTotal)}</td>
                    <td className="py-2 px-3 text-right font-bold">{r.contaminationRatePct}%</td>
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
