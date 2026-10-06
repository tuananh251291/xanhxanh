"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type UserRole } from "@/types";
import type { AttendanceDayCell, AttendanceSummary } from "@/lib/attendance";
import { DAY_STATUS_LABEL, DAY_STATUS_STYLE, DayDetailDialog, dayShortCode } from "../attendance-shared";

type Row = {
  userId: string;
  name: string;
  code: string;
  role: UserRole | null;
  warehouseId: string | null;
  warehouseName: string | null;
  days: AttendanceDayCell[];
  summary: AttendanceSummary;
};

const ALL = "ALL";

export default function TimesheetBoard() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [warehouseId, setWarehouseId] = useState<string>(ALL);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [dateKeys, setDateKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ userId: string; userName: string; date: string } | null>(null);

  useEffect(() => {
    fetch("/api/attendance/sites")
      .then((r) => r.json())
      .then((json) => setWarehouses((json.sites ?? []).map((s: { warehouseId: string; warehouseName: string }) => ({ id: s.warehouseId, name: s.warehouseName }))));
  }, []);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ month });
      if (warehouseId !== ALL) qs.set("warehouseId", warehouseId);
      const res = await fetch(`/api/attendance/timesheet?${qs}`);
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Không tải được bảng công"); return; }
      setRows(json.rows);
      setDateKeys(json.dateKeys);
    } finally {
      setLoading(false);
    }
  }, [month, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const exportHref = `/api/attendance/timesheet/export?month=${month}${warehouseId !== ALL ? `&warehouseId=${warehouseId}` : ""}`;
  const warehouseItems = { [ALL]: "Tất cả khu", ...Object.fromEntries(warehouses.map((w) => [w.id, w.name])) };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="text-xs text-text-secondary">Tháng</p>
          <Input type="month" value={month} onChange={(e) => { if (e.target.value) { setLoading(true); setMonth(e.target.value); } }} className="w-44" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-text-secondary">Khu</p>
          <Select items={warehouseItems} value={warehouseId} onValueChange={(v) => { setLoading(true); setWarehouseId(v as string); }}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(warehouseItems).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <a href={exportHref}>
          <Button variant="outline"><Download className="w-4 h-4" /> Xuất Excel</Button>
        </a>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(["WORK", "LEAVE", "MISSING_OUT", "ABSENT", "HOLIDAY", "OFF"] as const).map((s) => (
          <span key={s} className={cn("rounded px-2 py-0.5", DAY_STATUS_STYLE[s])}>{s === "MISSING_OUT" ? "Thiếu chấm (T)" : DAY_STATUS_LABEL[s]}</span>
        ))}
        <span className="text-text-muted">X đủ công · ½ nửa công · P phép · Ô ốm · KL không lương · V vắng · bấm ô để xem giờ & ảnh</span>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-text-muted text-sm">Không có NV chấm công nào</p>
          ) : (
            <table className="text-xs border-collapse">
              <thead>
                <tr className="bg-primary-light">
                  <th className="sticky left-0 z-10 bg-primary-light text-left px-3 py-2 text-primary-strong font-bold text-sm min-w-48">Nhân viên</th>
                  {dateKeys.map((k) => (
                    <th key={k} className="px-0.5 py-2 text-primary-strong font-bold text-sm w-8 text-center">{Number(k.slice(8))}</th>
                  ))}
                  <th className="px-2 py-2 text-primary-strong font-bold text-sm whitespace-nowrap">Công</th>
                  <th className="px-2 py-2 text-primary-strong font-bold text-sm whitespace-nowrap">Phép</th>
                  <th className="px-2 py-2 text-primary-strong font-bold text-sm whitespace-nowrap">Ốm/KL</th>
                  <th className="px-2 py-2 text-primary-strong font-bold text-sm whitespace-nowrap">Muộn/sớm</th>
                  <th className="px-2 py-2 text-primary-strong font-bold text-sm whitespace-nowrap">Thiếu</th>
                  <th className="px-2 py-2 text-primary-strong font-bold text-sm whitespace-nowrap">Vắng</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className="border-b border-divider last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                      <p className="font-medium text-foreground text-sm whitespace-nowrap">{r.name}</p>
                      <p className="text-text-muted whitespace-nowrap">{r.code} · {r.role ? ROLE_LABELS[r.role] : ""}{warehouseId === ALL && r.warehouseName ? ` · ${r.warehouseName}` : ""}</p>
                    </td>
                    {r.days.map((d) => (
                      <td key={d.date} className="p-0.5">
                        <button
                          type="button"
                          title={[DAY_STATUS_LABEL[d.status], d.checkIn && `Vào ${d.checkIn}`, d.checkOut && `Ra ${d.checkOut}`, d.lateMinutes && `Muộn ${d.lateMinutes}′`, d.earlyMinutes && `Sớm ${d.earlyMinutes}′`, d.fixedByRequest && "Bổ sung từ đơn"].filter(Boolean).join(" · ")}
                          onClick={() => setDetail({ userId: r.userId, userName: r.name, date: d.date })}
                          className={cn(
                            "w-7 h-7 rounded text-[0.7rem] font-semibold relative hover:ring-2 hover:ring-ring",
                            DAY_STATUS_STYLE[d.status]
                          )}
                        >
                          {dayShortCode(d)}
                          {(d.lateMinutes > 0 || d.earlyMinutes > 0) && <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-warning" />}
                        </button>
                      </td>
                    ))}
                    <td className="px-2 text-center font-semibold text-primary-strong text-sm">{r.summary.workUnits}</td>
                    <td className="px-2 text-center text-sm">{r.summary.paidLeaveUnits || ""}</td>
                    <td className="px-2 text-center text-sm">{r.summary.sickLeaveUnits + r.summary.unpaidLeaveUnits || ""}</td>
                    <td className="px-2 text-center text-sm whitespace-nowrap">
                      {r.summary.lateCount + r.summary.earlyCount > 0 ? `${r.summary.lateCount + r.summary.earlyCount} lần · ${r.summary.lateMinutes + r.summary.earlyMinutes}′` : ""}
                    </td>
                    <td className="px-2 text-center text-sm text-warning-foreground">{r.summary.missingCount || ""}</td>
                    <td className="px-2 text-center text-sm text-destructive">{r.summary.absentCount || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <DayDetailDialog target={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
