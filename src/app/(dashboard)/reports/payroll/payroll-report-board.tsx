"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPE_COLORS, TRAINEE_LABEL, TRAINEE_BADGE_COLOR, type EmploymentType } from "@/types";

type Warehouse = { id: string; code: string; name: string };
type Row = {
  staffId: string; staffCode: string; staffName: string; warehouseName: string | null;
  employmentType: EmploymentType | null; isTrainee: boolean;
  standardWorkDays: number; paidWorkDays: number; kpiWorkDays: number;
  baseSalaryMonthly: number | null; workSalary: number;
  violationPoints: number; recoveryPoints: number; compliancePoints: number;
  kpiBonusMaxAmount: number | null; complianceBonus: number;
  kpiDailyRate: number | null; kpiTargetAmount: number; eligibleProductionAmount: number;
  contaminationRatePct: number; productionOverBonus: number;
  otherBonusAmount: number; totalIncome: number;
};

const ALL_WAREHOUSE = "ALL";
const money = (n: number) => n.toLocaleString("vi-VN") + " VNĐ";

export default function PayrollReportBoard({ warehouses }: { warehouses: Warehouse[] }) {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSE);
  const [rows, setRows] = useState<Row[]>([]);
  const [rangeLabel, setRangeLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/reports/payroll?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      if (data.rangeStart && data.rangeEnd) {
        const rangeEndDisplay = new Date(new Date(data.rangeEnd).getTime() - 24 * 60 * 60 * 1000);
        setRangeLabel(`${format(new Date(data.rangeStart), "dd/MM/yyyy")} — ${format(rangeEndDisplay, "dd/MM/yyyy")}`);
      }
    } finally {
      setLoading(false);
    }
  }, [month, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const totalIncomeSum = rows.reduce((s, r) => s + r.totalIncome, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Kỳ lương (theo tháng chọn)</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cơ sở sản xuất</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId((v as string) ?? ALL_WAREHOUSE)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_WAREHOUSE}>Tất cả cơ sở</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {rangeLabel && (
            <p className="text-sm text-text-secondary">
              Kỳ đang xem: <strong className="text-foreground">{rangeLabel}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {!loading && rows.length > 0 && (
        <p className="text-sm text-text-secondary">
          {rows.length} NV cấy mô · Tổng thu nhập kỳ này: <strong className="text-primary-strong">{money(totalIncomeSum)}</strong>
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>Không có NV cấy mô nào khớp bộ lọc</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base"></th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Cơ sở</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Lương công việc</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Thưởng KPI tuân thủ</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Thưởng vượt KPI SL</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Khoản khác</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tổng thu nhập</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = expanded === r.staffId;
                    return (
                      <Fragment key={r.staffId}>
                        <tr
                          className="border-b last:border-0 even:bg-primary-light/30 cursor-pointer hover:bg-primary-light/50"
                          onClick={() => setExpanded(isOpen ? null : r.staffId)}
                        >
                          <td className="px-2 py-3 text-text-muted">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-4 py-3 font-mono text-text-secondary">{r.staffCode}</td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {r.staffName}
                            <div className="flex gap-1 mt-1">
                              {r.employmentType && (
                                <Badge className={EMPLOYMENT_TYPE_COLORS[r.employmentType]}>{EMPLOYMENT_TYPE_LABELS[r.employmentType]}</Badge>
                              )}
                              {r.isTrainee && <Badge className={TRAINEE_BADGE_COLOR}>{TRAINEE_LABEL}</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{r.warehouseName ?? "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{money(r.workSalary)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{money(r.complianceBonus)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{money(r.productionOverBonus)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{money(r.otherBonusAmount)}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-primary-strong">{money(r.totalIncome)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-background border-b">
                            <td colSpan={9} className="px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                                <div>
                                  <p className="text-text-muted text-xs">Ngày công tiêu chuẩn</p>
                                  <p className="font-medium tabular-nums">{r.standardWorkDays} ngày</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Ngày công hưởng lương</p>
                                  <p className="font-medium tabular-nums">{r.paidWorkDays} ngày</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Ngày công tính KPI</p>
                                  <p className="font-medium tabular-nums">{r.kpiWorkDays} ngày</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Lương tháng cài đặt</p>
                                  <p className="font-medium tabular-nums">{r.baseSalaryMonthly != null ? money(r.baseSalaryMonthly) : "Chưa cài đặt"}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Điểm vi phạm trong kỳ</p>
                                  <p className="font-medium tabular-nums">−{r.violationPoints} điểm</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Điểm phục hồi</p>
                                  <p className="font-medium tabular-nums">+{r.recoveryPoints} điểm</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Điểm tuân thủ cuối kỳ</p>
                                  <p className="font-bold tabular-nums text-primary-strong">{r.compliancePoints}/100</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Mức thưởng KPI tối đa</p>
                                  <p className="font-medium tabular-nums">{r.kpiBonusMaxAmount != null ? money(r.kpiBonusMaxAmount) : "Chưa cài đặt"}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">KPI/ngày cài đặt</p>
                                  <p className="font-medium tabular-nums">{r.kpiDailyRate != null ? money(r.kpiDailyRate) : "Chưa cài đặt"}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Sản lượng chỉ tiêu</p>
                                  <p className="font-medium tabular-nums">{money(r.kpiTargetAmount)}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Sản lượng đủ điều kiện</p>
                                  <p className="font-medium tabular-nums">{money(r.eligibleProductionAmount)}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Tỉ lệ nhiễm trong kỳ</p>
                                  <p className={`font-medium tabular-nums ${r.contaminationRatePct > 5 ? "text-destructive" : ""}`}>
                                    {r.contaminationRatePct}%
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
