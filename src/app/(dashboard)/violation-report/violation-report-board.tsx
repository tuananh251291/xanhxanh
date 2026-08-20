"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import WarehouseFilterSelect from "@/components/shared/warehouse-filter-select";

type ViolationRow = {
  id: string;
  createdAt: string;
  violationLabel: string;
  checkedByCode: string;
  checkedByName: string;
};

type StaffRow = {
  staffId: string;
  staffCode: string;
  staffName: string;
  count: number;
  records: ViolationRow[];
};

const toDateInputValue = (d: Date) => format(d, "yyyy-MM-dd");

export default function ViolationReportBoard({
  canFilterByWarehouse = false,
  canManage = false,
}: {
  canFilterByWarehouse?: boolean;
  canManage?: boolean;
}) {
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [from, setFrom] = useState(toDateInputValue(startOfMonth(new Date())));
  const [to, setTo] = useState(toDateInputValue(endOfMonth(new Date())));
  const [warehouseId, setWarehouseId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (warehouseId) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/violation-report?${params}`);
      const data = await res.json();
      setStaffList(Array.isArray(data.staffList) ? data.staffList : []);
    } finally {
      setLoading(false);
    }
  }, [from, to, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const deleteRecord = async (id: string) => {
    if (!window.confirm("Xoá lỗi vi phạm này? Không thể hoàn tác.")) return;
    const res = await fetch(`/api/violation-records/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
    toast.success("Đã xoá");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          {canFilterByWarehouse && <WarehouseFilterSelect value={warehouseId} onChange={setWarehouseId} />}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : staffList.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-success-foreground" />
          <p>Không có NV cấy mô nào bị ghi nhận vi phạm trong khoảng thời gian này</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên NV</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lỗi vi phạm</th>
                    <th className="px-4 py-3 font-bold text-base"></th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((s) => (
                    <Fragment key={s.staffId}>
                      <tr className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                        <td className="px-4 py-3 font-mono text-text-secondary">{s.staffCode}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{s.staffName}</td>
                        <td className="px-4 py-3 text-right">
                          <Badge className="bg-danger-light text-destructive">{s.count.toLocaleString("vi-VN")} lần</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => setExpandedId(expandedId === s.staffId ? null : s.staffId)}
                          >
                            {expandedId === s.staffId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </td>
                      </tr>
                      {expandedId === s.staffId && (
                        <tr className="border-b last:border-0">
                          <td colSpan={4} className="px-4 py-3 bg-background">
                            <div className="rounded-lg border border-divider divide-y divide-divider">
                              {s.records.map((r) => (
                                <div key={r.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-text-secondary whitespace-nowrap">
                                    {format(new Date(r.createdAt), "HH:mm dd/MM/yyyy", { locale: vi })}
                                  </span>
                                  <span className="font-mono text-destructive">{r.violationLabel}</span>
                                  <span className="text-foreground">
                                    Ghi nhận bởi {r.checkedByName} <span className="font-mono text-text-muted">({r.checkedByCode})</span>
                                  </span>
                                  {canManage && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteRecord(r.id)}>
                                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
