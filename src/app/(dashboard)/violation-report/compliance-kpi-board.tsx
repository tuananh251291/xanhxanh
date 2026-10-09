"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import WarehouseFilterSelect from "@/components/shared/warehouse-filter-select";
import { cn } from "@/lib/utils";
import type { ComplianceKpiRow } from "@/lib/compliance-kpi-report";

const money = (n: number) => n.toLocaleString("vi-VN");

// Tô màu điểm tuân thủ: 100 xanh, 80–99 vàng, dưới 80 đỏ.
function pointsClass(p: number) {
  if (p >= 100) return "text-primary-strong";
  if (p >= 80) return "text-warning-foreground";
  return "text-destructive";
}

// Tab "KPI tuân thủ" ở Báo cáo vi phạm — HCNS xem điểm tuân thủ + thưởng KPI tuân thủ từng NV cấy mô theo
// kỳ lương, lọc theo khu sản xuất, tải Excel (xem /api/reports/compliance-kpi).
export default function ComplianceKpiBoard() {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [warehouseId, setWarehouseId] = useState("");
  const [rows, setRows] = useState<ComplianceKpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Không tự bật loading ở đây (gọi từ effect) — chỗ đổi bộ lọc tự bật.
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ month });
      if (warehouseId) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/reports/compliance-kpi?${params}`);
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Không tải được báo cáo"); return; }
      setRows(json.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [month, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const exportParams = new URLSearchParams({ month });
  if (warehouseId) exportParams.set("warehouseId", warehouseId);
  const below100 = rows.filter((r) => r.compliancePoints < 100).length;
  const disqualified = rows.filter((r) => r.complianceKpiDisqualified).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Kỳ lương</Label>
            <Input type="month" value={month} onChange={(e) => { if (e.target.value) { setLoading(true); setMonth(e.target.value); } }} className="w-40" />
          </div>
          <WarehouseFilterSelect value={warehouseId} onChange={(v) => { setLoading(true); setWarehouseId(v); }} />
          <a href={`/api/reports/compliance-kpi/export?${exportParams}`} className="ml-auto">
            <Button type="button"><Download className="w-4 h-4" /> Tải Excel KPI tuân thủ</Button>
          </a>
        </CardContent>
      </Card>

      {!loading && rows.length > 0 && (
        <p className="text-sm text-text-secondary">
          {rows.length} NV cấy mô · <span className="text-warning-foreground font-medium">{below100} NV dưới 100 điểm</span>
          {disqualified > 0 && <> · <span className="text-destructive font-medium">{disqualified} NV bị loại thưởng KPI</span></>}
          {" "}· Điểm tuân thủ = 100 − điểm vi phạm + điểm phục hồi (tối đa 100)
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">Không có NV cấy mô nào khớp bộ lọc</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="px-2 py-3" />
                  <th className="text-left px-3 py-3 text-primary-strong font-bold text-base">Nhân viên</th>
                  <th className="text-left px-3 py-3 text-primary-strong font-bold text-base">Khu sản xuất</th>
                  <th className="text-right px-3 py-3 text-primary-strong font-bold text-base whitespace-nowrap">Số lỗi</th>
                  <th className="text-right px-3 py-3 text-primary-strong font-bold text-base whitespace-nowrap">Điểm trừ</th>
                  <th className="text-right px-3 py-3 text-primary-strong font-bold text-base whitespace-nowrap">Phục hồi</th>
                  <th className="text-right px-3 py-3 text-primary-strong font-bold text-base whitespace-nowrap">Điểm tuân thủ</th>
                  <th className="text-right px-3 py-3 text-primary-strong font-bold text-base whitespace-nowrap">Thưởng KPI tuân thủ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = expanded === r.staffId;
                  const hasDetail = r.violations.length > 0 || r.recoveries.length > 0;
                  return (
                    <Fragment key={r.staffId}>
                      <tr
                        className={cn("border-b border-divider", hasDetail && "cursor-pointer hover:bg-background")}
                        onClick={() => hasDetail && setExpanded(open ? null : r.staffId)}
                      >
                        <td className="px-2 py-2 text-text-muted">
                          {hasDetail && (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{r.staffName}</p>
                          <p className="text-xs text-text-muted font-mono">{r.staffCode}</p>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{r.warehouseName ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{r.violationCount || ""}</td>
                        <td className="px-3 py-2 text-right text-destructive">{r.violationPoints ? `−${r.violationPoints}` : ""}</td>
                        <td className="px-3 py-2 text-right text-primary-strong">{r.recoveryPoints ? `+${r.recoveryPoints}` : ""}</td>
                        <td className={cn("px-3 py-2 text-right font-bold", pointsClass(r.compliancePoints))}>{r.compliancePoints}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.complianceKpiDisqualified ? (
                            <Badge variant="overdue">Bị loại</Badge>
                          ) : r.kpiBonusMaxAmount == null ? (
                            <span className="text-xs text-text-muted">Chưa cài mức thưởng</span>
                          ) : (
                            money(r.complianceBonus)
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-divider bg-background">
                          <td />
                          <td colSpan={7} className="px-3 py-3 space-y-3">
                            {r.violations.length > 0 && (
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground">Lỗi vi phạm trong kỳ</p>
                                {r.violations.map((v) => (
                                  <div key={v.id} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-text-secondary">
                                      {format(new Date(v.createdAt), "dd/MM HH:mm")} · {v.label}
                                      {v.groupName && <span className="text-text-muted"> ({v.groupName})</span>}
                                      <span className="text-text-muted"> · ghi bởi {v.createdByName}</span>
                                    </span>
                                    <span className="whitespace-nowrap">
                                      {v.disqualifiesComplianceKpi && <Badge variant="overdue" className="mr-2">Loại thưởng</Badge>}
                                      <span className="text-destructive font-medium">{v.points ? `−${v.points}` : "0"}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {r.recoveries.length > 0 && (
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground">Điểm phục hồi trong kỳ</p>
                                {r.recoveries.map((x) => (
                                  <div key={x.id} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-text-secondary">
                                      {format(new Date(x.createdAt), "dd/MM HH:mm")} · {x.reason}
                                      <span className="text-text-muted"> · ghi bởi {x.createdByName}</span>
                                    </span>
                                    <span className="text-primary-strong font-medium">+{x.points}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
