"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StaffCombobox from "@/components/shared/staff-combobox";
import { Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import { vi } from "date-fns/locale";

type Staff = { id: string; name: string; code: string };
type Row = {
  date: string;
  totalCreated: number;
  selfContaminated: number;
  selfRatePct: number;
  redFlowHandedOver: number;
  redFlowContaminated: number;
  redFlowRatePct: number;
  redFlowApplicableCount: number;
};
type Summary = {
  totalCreated: number;
  selfContaminated: number;
  selfRatePct: number;
  redFlowHandedOver: number;
  redFlowContaminated: number;
  redFlowRatePct: number;
};

const ALL_STAFF = "ALL";

export default function DarkRoomContaminationReport() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<string>(ALL_STAFF);
  const [from, setFrom] = useState(format(subDays(new Date(), 14), "yyyy-MM-dd"));
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
      if (staffId !== ALL_STAFF) params.set("staffId", staffId);
      const res = await fetch(`/api/reports/dark-room-contamination?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [staffId, from, to]);

  useEffect(() => { load(); }, [load]);

  const staffOptions = useMemo(
    () => [{ value: ALL_STAFF, label: "Toàn hệ thống" }, ...staffList.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))],
    [staffList]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Tỉ lệ nhiễm phòng tối</CardTitle>
            <p className="text-sm text-text-secondary mt-1">
              Tự phát hiện lúc NV cấy mô kiểm tra sau đủ ngày ủ tối, và Kho mô phát hiện thêm khi kiểm tra lại (luồng Đỏ) — xem chi tiết theo ngày
            </p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Nhân viên</Label>
              <StaffCombobox options={staffOptions} value={staffId} onChange={setStaffId} />
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
            Tự phát hiện: <strong className="text-destructive">{summary.selfContaminated.toLocaleString("vi-VN")}</strong>/{summary.totalCreated.toLocaleString("vi-VN")}
            {" "}(<strong>{summary.selfRatePct}%</strong>) · Luồng Đỏ phát hiện thêm: <strong className="text-destructive">{summary.redFlowContaminated.toLocaleString("vi-VN")}</strong>/{summary.redFlowHandedOver.toLocaleString("vi-VN")}
            {" "}(<strong>{summary.redFlowRatePct}%</strong>)
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">Không có dữ liệu kiểm tra trong khoảng thời gian này</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light text-left text-primary-strong">
                  <th className="py-2 px-3 font-bold text-base">Ngày</th>
                  <th className="py-2 px-3 font-bold text-base text-right">Tổng tạo ra</th>
                  <th className="py-2 px-3 font-bold text-base text-right">Tự phát hiện</th>
                  <th className="py-2 px-3 font-bold text-base text-right">Tỉ lệ tự phát hiện</th>
                  <th className="py-2 px-3 font-bold text-base text-right">Luồng Đỏ phát hiện thêm</th>
                  <th className="py-2 px-3 font-bold text-base text-right">Tỉ lệ luồng Đỏ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} className="border-b last:border-0 even:bg-primary-light/30">
                    <td className="py-2 px-3 whitespace-nowrap">{format(new Date(r.date), "dd/MM/yyyy", { locale: vi })}</td>
                    <td className="py-2 px-3 text-right">{r.totalCreated.toLocaleString("vi-VN")}</td>
                    <td className="py-2 px-3 text-right text-destructive font-medium">{r.selfContaminated.toLocaleString("vi-VN")}</td>
                    <td className="py-2 px-3 text-right font-bold">{r.selfRatePct}%</td>
                    <td className="py-2 px-3 text-right text-destructive font-medium">
                      {r.redFlowApplicableCount > 0 ? r.redFlowContaminated.toLocaleString("vi-VN") : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-bold">
                      {r.redFlowApplicableCount > 0 ? `${r.redFlowRatePct}%` : "—"}
                    </td>
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
