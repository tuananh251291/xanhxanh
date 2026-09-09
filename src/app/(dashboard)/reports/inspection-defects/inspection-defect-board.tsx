"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronDown, ChevronRight, Download } from "lucide-react";
import { format } from "date-fns";

type Warehouse = { id: string; code: string; name: string };
type TicketRow = {
  inspectionId: string; transferCode: string; transferDate: string;
  staffId: string; staffCode: string; staffName: string; inspectedByName: string;
  plantTypeCode: string; plantTypeName: string; stageCode: string;
  handedOverQuantity: number; unqualifiedQuantity: number; contaminatedQuantity: number;
  passedQuantity: number; creditedQuantity: number;
};
type StaffSummary = {
  staffId: string; staffCode: string; staffName: string;
  ticketCount: number; totalUnqualifiedQuantity: number; totalContaminatedQuantity: number;
};

const ALL_WAREHOUSE = "ALL";
const num = (n: number) => n.toLocaleString("vi-VN");

export default function InspectionDefectBoard({ warehouses }: { warehouses: Warehouse[] }) {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSE);
  const [staffSummary, setStaffSummary] = useState<StaffSummary[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/reports/inspection-defects?${params}`);
      const data = await res.json();
      setStaffSummary(Array.isArray(data.staffSummary) ? data.staffSummary : []);
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } finally {
      setLoading(false);
    }
  }, [month, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const totalUnqualified = staffSummary.reduce((s, r) => s + r.totalUnqualifiedQuantity, 0);
  const totalContaminated = staffSummary.reduce((s, r) => s + r.totalContaminatedQuantity, 0);
  const selectedWarehouse = warehouseId !== ALL_WAREHOUSE ? warehouses.find((w) => w.id === warehouseId) : null;

  const exportParams = new URLSearchParams({ month });
  if (warehouseId !== ALL_WAREHOUSE) exportParams.set("warehouseId", warehouseId);
  const exportHref = `/api/reports/inspection-defects/export?${exportParams}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Tháng</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          </div>
          {warehouses.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Cơ sở sản xuất</Label>
              <Select
                items={[{ value: ALL_WAREHOUSE, label: "Tất cả cơ sở" }, ...warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))]}
                value={warehouseId}
                onValueChange={(v) => setWarehouseId((v as string) ?? ALL_WAREHOUSE)}
              >
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_WAREHOUSE}>Tất cả cơ sở</SelectItem>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <a href={exportHref} className="ml-auto">
            <Button type="button" className="bg-primary hover:bg-primary-hover">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Xuất Excel
            </Button>
          </a>
        </CardContent>
      </Card>

      {selectedWarehouse && (
        <p className="text-sm text-text-secondary">
          Bạn đang xem cơ sở <strong className="text-foreground">{selectedWarehouse.name} ({selectedWarehouse.code})</strong>.
        </p>
      )}

      {!loading && staffSummary.length > 0 && (
        <p className="text-sm text-text-secondary">
          {staffSummary.length} NV cấy mô bị trừ · Tổng SL không đạt: <strong className="text-destructive">{num(totalUnqualified)}</strong>
          {" "}· Tổng SL nhiễm: <strong className="text-destructive">{num(totalContaminated)}</strong>
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : staffSummary.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>Không có phiếu kiểm tra nào ghi nhận hàng không đạt/nhiễm khớp bộ lọc</p>
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
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số phiếu</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL không đạt</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL nhiễm</th>
                  </tr>
                </thead>
                <tbody>
                  {staffSummary.map((s) => {
                    const isOpen = expanded === s.staffId;
                    const staffTickets = tickets.filter((t) => t.staffId === s.staffId);
                    return (
                      <Fragment key={s.staffId}>
                        <tr
                          className="border-b last:border-0 even:bg-primary-light/30 cursor-pointer hover:bg-primary-light/50"
                          onClick={() => setExpanded(isOpen ? null : s.staffId)}
                        >
                          <td className="px-2 py-3 text-text-muted">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-4 py-3 font-mono text-text-secondary">{s.staffCode}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{s.staffName}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{num(s.ticketCount)}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-destructive">{num(s.totalUnqualifiedQuantity)}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-destructive">{num(s.totalContaminatedQuantity)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-background border-b">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="overflow-x-auto border border-divider rounded-md">
                                <table className="w-full text-xs">
                                  <thead className="bg-primary-light">
                                    <tr>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Mã phiếu</th>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Ngày</th>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Người kiểm tra</th>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Mã cây</th>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Quy cách</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL bàn giao</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL không đạt</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL nhiễm</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL đạt</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {staffTickets.map((t, i) => (
                                      <tr key={`${t.inspectionId}-${i}`} className="border-t border-divider even:bg-background odd:bg-card">
                                        <td className="px-3 py-1.5 font-mono">{t.transferCode}</td>
                                        <td className="px-3 py-1.5 tabular-nums">{format(new Date(t.transferDate), "dd/MM/yyyy")}</td>
                                        <td className="px-3 py-1.5">{t.inspectedByName}</td>
                                        <td className="px-3 py-1.5">{t.plantTypeCode} — {t.plantTypeName}</td>
                                        <td className="px-3 py-1.5">{t.stageCode}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{num(t.handedOverQuantity)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-destructive">{num(t.unqualifiedQuantity)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-destructive">{num(t.contaminatedQuantity)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{num(t.passedQuantity)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
