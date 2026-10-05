"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import ExcelImportCard from "@/components/shared/excel-import-card";
import WarehouseFilterSelect from "@/components/shared/warehouse-filter-select";
import { Loader2, Check, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

type Row = { staffId: string; staffCode: string; staffName: string; warehouseName: string | null; kpiBonusAmount: number | null };

// "Mức thưởng KPI tối đa theo NV" — mức RIÊNG từng NV cấy mô (StaffBaseSalary.kpiBonusAmount), dùng thay mức
// chung theo kỳ khi tính Thưởng KPI tuân thủ (xem src/lib/payroll-calculation.ts). Để trống = dùng mức chung.
export default function StaffKpiMaxSection({ globalAmount }: { globalAmount: number | null }) {
  const [rows, setRows] = useState<Row[]>([]);
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
      const res = await fetch(`/api/payroll/staff-base-salary?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const draftValue = (r: Row) => drafts[r.staffId] ?? (r.kpiBonusAmount != null ? String(r.kpiBonusAmount) : "");

  const save = async (r: Row) => {
    const text = draftValue(r).trim();
    const value = text === "" ? null : Number(text);
    if (value !== null && (!Number.isInteger(value) || value < 0)) { toast.error("Số tiền không hợp lệ"); return; }
    setSavingId(r.staffId);
    try {
      const res = await fetch("/api/payroll/staff-base-salary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: r.staffId, kpiBonusAmount: value }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(value === null ? `${r.staffName} dùng mức chung` : `Đã lưu mức thưởng KPI cho ${r.staffName}`);
      setDrafts((p) => { const n = { ...p }; delete n[r.staffId]; return n; });
      load();
    } finally {
      setSavingId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => r.staffCode.toLowerCase().includes(q) || r.staffName.toLowerCase().includes(q)) : rows;
  const ownCount = rows.filter((r) => r.kpiBonusAmount != null).length;
  const globalLabel = globalAmount != null ? `${globalAmount.toLocaleString("vi-VN")} (mức chung)` : "Chưa cài mức chung";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <p className="text-base font-bold text-primary-strong">Mức thưởng KPI tối đa theo từng NV</p>
            <p className="text-sm text-text-secondary">
              NV có mức riêng thì dùng mức riêng; để trống = dùng mức chung ở trên. Đang có {ownCount}/{rows.length} NV cài mức riêng.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <WarehouseFilterSelect value={warehouseId} onChange={setWarehouseId} />
              <Input placeholder="Tìm theo mã hoặc tên NV…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56" />
            </div>
            <Dialog open={excelOpen} onOpenChange={setExcelOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Nhập bằng Excel
              </DialogTrigger>
              <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <ExcelImportCard
                  icon={<FileSpreadsheet className="w-5 h-5" />}
                  title="Nhập mức thưởng KPI theo NV"
                  description="File mẫu đã điền sẵn mọi NV cấy mô kèm mức đang cài — sửa cột Mức thưởng KPI tối đa rồi tải lên. Để trống = dùng mức chung. NV không có trong file giữ nguyên. File có dòng lỗi (trùng mã, sai mã NV, số không hợp lệ) sẽ không được ghi, cần sửa rồi tải lên lại."
                  templateUrl="/api/payroll/staff-kpi-max/import"
                  uploadUrl="/api/payroll/staff-kpi-max/import"
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
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Mức thưởng KPI tối đa (VNĐ)</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.staffId} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-text-secondary">{r.staffCode}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{r.staffName}</td>
                      <td className="px-4 py-3 text-text-secondary">{r.warehouseName ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Input
                          type="number" min={0}
                          value={draftValue(r)}
                          placeholder={globalLabel}
                          onChange={(e) => setDrafts((p) => ({ ...p, [r.staffId]: e.target.value }))}
                          className="w-56 h-8 text-right ml-auto"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingId === r.staffId} onClick={() => save(r)}>
                          {savingId === r.staffId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-primary-strong" />}
                        </Button>
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
