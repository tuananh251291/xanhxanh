"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import ExcelImportCard from "@/components/shared/excel-import-card";
import { Loader2, Check, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { KPI_RATE_STAGE_CODES } from "@/types";

type StageCode = (typeof KPI_RATE_STAGE_CODES)[number];
type Row = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; rates: Record<StageCode, number | null> };

const draftKey = (plantTypeId: string, stageCode: StageCode) => `${plantTypeId}|${stageCode}`;

export default function PlantTypeKpiRateBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [excelOpen, setExcelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/plant-type-kpi-rate");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const draftValue = (r: Row, sc: StageCode) =>
    drafts[draftKey(r.plantTypeId, sc)] ?? (r.rates[sc] != null ? String(r.rates[sc]) : "");

  const save = async (r: Row) => {
    const rates: { stageCode: StageCode; vndPerUnit: number | null }[] = [];
    for (const sc of KPI_RATE_STAGE_CODES) {
      const text = draftValue(r, sc).trim();
      const value = text === "" ? null : Number(text);
      if (value != null && (!Number.isInteger(value) || value < 0)) { toast.error(`Đơn giá ${sc} không hợp lệ`); return; }
      rates.push({ stageCode: sc, vndPerUnit: value });
    }
    setSavingId(r.plantTypeId);
    try {
      const res = await fetch("/api/payroll/plant-type-kpi-rate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantTypeId: r.plantTypeId, rates }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã lưu đơn giá cho ${r.plantTypeCode}`);
      load();
    } finally {
      setSavingId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.plantTypeCode.toLowerCase().includes(q) || r.plantTypeName.toLowerCase().includes(q))
    : rows;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
          <Input placeholder="Tìm theo mã hoặc tên cây…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64" />
          <Dialog open={excelOpen} onOpenChange={setExcelOpen}>
            <DialogTrigger render={<Button size="sm" variant="outline" />}>
              <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Nhập đơn giá bằng Excel
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
              <ExcelImportCard
                icon={<FileSpreadsheet className="w-5 h-5" />}
                title="Nhập đơn giá bằng Excel"
                description="File tải lên THAY THẾ toàn bộ bảng đơn giá theo Mã cây + Quy cách: đơn giá khác sẽ được ghi đè, giống thì giữ nguyên, cặp không có trong file (hoặc để trống Đơn giá) sẽ bị xoá. Nên tải file mẫu (đã điền sẵn số liệu hiện tại) rồi sửa trên đó."
                templateUrl="/api/payroll/plant-type-kpi-rate/import"
                uploadUrl="/api/payroll/plant-type-kpi-rate/import"
                onImported={() => { setDrafts({}); load(); }}
              />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted"><p>Không có mã cây nào khớp</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                    {KPI_RATE_STAGE_CODES.map((sc) => (
                      <th key={sc} className="text-right px-4 py-3 text-primary-strong font-bold text-base whitespace-nowrap">
                        {sc} <span className="font-normal text-sm">(VNĐ/{sc.startsWith("M") ? "cụm" : "cây"})</span>
                      </th>
                    ))}
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.plantTypeId} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-info-foreground">{r.plantTypeCode}</td>
                      <td className="px-4 py-3 text-foreground">{r.plantTypeName}</td>
                      {KPI_RATE_STAGE_CODES.map((sc) => (
                        <td key={sc} className="px-4 py-3 text-right">
                          <Input
                            type="number" min={0}
                            value={draftValue(r, sc)}
                            onChange={(e) => setDrafts((p) => ({ ...p, [draftKey(r.plantTypeId, sc)]: e.target.value }))}
                            className="w-32 h-8 text-right ml-auto"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingId === r.plantTypeId} onClick={() => save(r)}>
                          {savingId === r.plantTypeId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-primary-strong" />}
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
