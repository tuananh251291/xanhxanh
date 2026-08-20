"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import WarehouseFilterSelect from "@/components/shared/warehouse-filter-select";

type EditRow = {
  id: string;
  createdAt: string;
  editedByCode: string;
  editedByName: string;
  instructionCode: string;
  recordDate: string;
};

type StaffRow = {
  staffId: string;
  staffCode: string;
  staffName: string;
  count: number;
  edits: EditRow[];
};

export default function DataCorrectionsBoard({ canFilterByWarehouse = false }: { canFilterByWarehouse?: boolean }) {
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (warehouseId) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/daily-record-edits/weekly-summary?${params}`);
      const data = await res.json();
      setStaffList(Array.isArray(data.staffList) ? data.staffList : []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {canFilterByWarehouse && (
        <Card>
          <CardContent className="p-4">
            <WarehouseFilterSelect value={warehouseId} onChange={setWarehouseId} />
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : staffList.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-success-foreground" />
          <p>Chưa có NV nào bị sửa lại nhật ký cấy trong tuần này</p>
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
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lần bị sửa tuần này</th>
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
                              {s.edits.map((e) => (
                                <div key={e.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-text-secondary whitespace-nowrap">
                                    {format(new Date(e.createdAt), "HH:mm dd/MM/yyyy", { locale: vi })}
                                  </span>
                                  <span className="font-mono text-info-foreground">{e.instructionCode}</span>
                                  <span className="text-text-muted">
                                    nhật ký ngày {format(new Date(e.recordDate), "dd/MM/yyyy", { locale: vi })}
                                  </span>
                                  <span className="text-foreground">
                                    Sửa bởi {e.editedByName} <span className="font-mono text-text-muted">({e.editedByCode})</span>
                                  </span>
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
