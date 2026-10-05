"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import ExcelImportCard from "@/components/shared/excel-import-card";
import WarehouseFilterSelect from "@/components/shared/warehouse-filter-select";
import { Loader2, Check, FileSpreadsheet, Calculator } from "lucide-react";
import { toast } from "sonner";

type Annual = { year: number; daysInYear: number; sundays: number; holidays: number; leaveDays: number; workDays: number };
type Row = {
  staffId: string;
  staffCode: string;
  staffName: string;
  isTrainee: boolean;
  warehouseName: string | null;
  monthlyAmount: number | null;
  complianceKpiMax: number | null;
  complianceKpiMaxIsOwn: boolean;
  workKpiMaxAmount: number | null;
  kpiDailyRate: number | null;
};

const num = (n: number | null) => (n != null ? n.toLocaleString("vi-VN") : "—");

// "KPI của nhân viên" — KPI/ngày TỰ TÍNH (xem src/lib/kpi-daily-rate.ts):
//   (Lương công việc + Mức KPI tuân thủ tối đa + Mức KPI công việc tối đa) × 12 ÷ số ngày làm việc trong năm.
// Chỉ "Mức KPI công việc tối đa" nhập ở đây (tay hoặc Excel); Lương công việc ở tab Lương công việc, Mức KPI
// tuân thủ tối đa ở tab Mức thưởng KPI.
export default function StaffKpiDailyRateBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [annual, setAnnual] = useState<Annual | null>(null);
  const [loading, setLoading] = useState(true);
  const [warehouseId, setWarehouseId] = useState("");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [excelOpen, setExcelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (warehouseId) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/payroll/staff-kpi-daily-rate?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setAnnual(data?.annual ?? null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const draftValue = (r: Row) => drafts[r.staffId] ?? (r.workKpiMaxAmount != null ? String(r.workKpiMaxAmount) : "");

  const save = async (r: Row) => {
    const text = draftValue(r).trim();
    const value = text === "" ? null : Number(text);
    if (value !== null && (!Number.isInteger(value) || value < 0)) { toast.error("Số tiền không hợp lệ"); return; }
    setSavingId(r.staffId);
    try {
      const res = await fetch("/api/payroll/staff-kpi-daily-rate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: r.staffId, workKpiMaxAmount: value }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã lưu mức KPI công việc cho ${r.staffName}`);
      setDrafts((p) => { const n = { ...p }; delete n[r.staffId]; return n; });
      load();
    } finally {
      setSavingId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => r.staffCode.toLowerCase().includes(q) || r.staffName.toLowerCase().includes(q)) : rows;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-info-light text-info-foreground text-sm p-3">
            <Calculator className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>
                <strong>KPI/ngày tự tính</strong> = (Lương công việc + Mức KPI tuân thủ tối đa + Mức KPI công việc tối đa) × 12 tháng ÷ số
                ngày làm việc trong năm.
              </p>
              {annual && (
                <p>
                  Năm {annual.year}: {annual.daysInYear} ngày − {annual.sundays} Chủ nhật − {annual.holidays} ngày nghỉ lễ (không tính ngày lễ
                  trùng Chủ nhật) − {annual.leaveDays} ngày phép = <strong>{annual.workDays} ngày làm việc</strong>.
                </p>
              )}
              <p className="text-xs">
                Sản lượng chỉ tiêu = KPI/ngày × Ngày công tính KPI. KPI công việc = Mức KPI công việc tối đa × tỉ lệ đạt (tối đa 100%): NV
                học việc theo điểm Đánh giá thử việc trong kỳ, NV chính thức theo sản lượng đủ điều kiện ÷ sản lượng chỉ tiêu.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <WarehouseFilterSelect value={warehouseId} onChange={setWarehouseId} />
              <Input placeholder="Tìm theo mã hoặc tên NV…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56" />
            </div>
            <Dialog open={excelOpen} onOpenChange={setExcelOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Nhập Mức KPI công việc bằng Excel
              </DialogTrigger>
              <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <ExcelImportCard
                  icon={<FileSpreadsheet className="w-5 h-5" />}
                  title="Nhập Mức KPI công việc tối đa theo NV"
                  description="File mẫu đã điền sẵn mọi NV cấy mô kèm mức đang cài — sửa cột Mức KPI công việc tối đa rồi tải lên. Để trống = chưa cài (tính như 0). NV không có trong file giữ nguyên. File có dòng lỗi (trùng mã, sai mã NV, số không hợp lệ) sẽ không được ghi, cần sửa rồi tải lên lại."
                  templateUrl="/api/payroll/staff-kpi-max/import?kind=work"
                  uploadUrl="/api/payroll/staff-kpi-max/import?kind=work"
                  onImported={() => { setDrafts({}); load(); }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted"><p>Không có NV cấy mô nào khớp bộ lọc</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Cơ sở</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Lương công việc</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Mức KPI tuân thủ tối đa</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Mức KPI công việc tối đa</th>
                    <th className="px-2 py-3"></th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">KPI/ngày (tự tính)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.staffId} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-text-secondary">{r.staffCode}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {r.staffName}
                        {r.isTrainee && <span className="ml-1.5 text-xs rounded px-1 py-0.5 bg-violet-light text-violet-foreground">Học việc</span>}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{r.warehouseName ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(r.monthlyAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {num(r.complianceKpiMax)}
                        {r.complianceKpiMax != null && !r.complianceKpiMaxIsOwn && <span className="block text-xs text-text-muted">mức chung</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Input
                          type="number" min={0}
                          value={draftValue(r)}
                          placeholder="Chưa cài"
                          onChange={(e) => setDrafts((p) => ({ ...p, [r.staffId]: e.target.value }))}
                          className="w-40 h-8 text-right ml-auto"
                        />
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingId === r.staffId} onClick={() => save(r)}>
                          {savingId === r.staffId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-primary-strong" />}
                        </Button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-primary-strong">
                        {r.kpiDailyRate != null ? r.kpiDailyRate.toLocaleString("vi-VN") : <span className="font-normal text-text-muted">Chưa đủ dữ liệu</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
