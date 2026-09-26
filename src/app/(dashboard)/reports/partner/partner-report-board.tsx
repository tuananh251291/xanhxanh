"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import OperationErrorTab from "./operation-error-tab";

type Warehouse = { id: string; code: string; name: string };
type PlantTypeRow = {
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  receiptDamage: number;
  careDamage: number;
  total: number;
};
type DamageReport = { receiptDamage: number; careDamage: number; totalDamage: number; byPlantType: PlantTypeRow[] };

const ALL_WAREHOUSE = "ALL";
const num = (n: number) => n.toLocaleString("vi-VN");

function StatCard({ title, value, icon: Icon, color }: { title: string; value: string; icon: React.ElementType; color: "red" | "yellow" }) {
  const colorMap = { red: "bg-danger-light text-destructive", yellow: "bg-warning-light text-warning-foreground" };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="py-16 text-center text-text-muted">
        <ClipboardList className="w-10 h-10 mx-auto mb-3 text-text-muted" />
        <p>{title} — tính năng đang được xây dựng, sẽ bổ sung sau.</p>
      </CardContent>
    </Card>
  );
}

function DamageReportTab({ warehouses }: { warehouses: Warehouse[] }) {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSE);
  const [report, setReport] = useState<DamageReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/reports/partner-damage?${params}`);
      const data = await res.json();
      setReport(res.ok ? data : null);
    } finally {
      setLoading(false);
    }
  }, [month, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const selectedWarehouse = warehouseId !== ALL_WAREHOUSE ? warehouses.find((w) => w.id === warehouseId) : null;

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
              <Label className="text-xs">Kho thị trường</Label>
              <Select
                items={[{ value: ALL_WAREHOUSE, label: "Tất cả kho" }, ...warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))]}
                value={warehouseId}
                onValueChange={(v) => setWarehouseId((v as string) ?? ALL_WAREHOUSE)}
              >
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_WAREHOUSE}>Tất cả kho</SelectItem>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedWarehouse && (
        <p className="text-sm text-text-secondary">
          Bạn đang xem <strong className="text-foreground">{selectedWarehouse.name} ({selectedWarehouse.code})</strong>.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : !report ? (
        <Card><CardContent className="py-16 text-center text-text-muted"><p>Không tải được dữ liệu</p></CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Tổng số hỏng" value={num(report.totalDamage)} icon={AlertTriangle} color="red" />
            <StatCard title="Hỏng khi nhập" value={num(report.receiptDamage)} icon={AlertTriangle} color="yellow" />
            <StatCard title="Hỏng do chăm sóc" value={num(report.careDamage)} icon={AlertTriangle} color="yellow" />
          </div>

          {report.byPlantType.length === 0 ? (
            <Card><CardContent className="py-16 text-center text-text-muted"><p>Không có hỏng hủy nào trong tháng này</p></CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
                        <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                        <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Hỏng khi nhập</th>
                        <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Hỏng do chăm sóc</th>
                        <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byPlantType.map((r) => (
                        <tr key={r.plantTypeId} className="border-b last:border-0 even:bg-primary-light/30">
                          <td className="px-4 py-3 font-mono text-text-secondary">{r.plantTypeCode}</td>
                          <td className="px-4 py-3 text-foreground">{r.plantTypeName}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-destructive">{num(r.receiptDamage)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-destructive">{num(r.careDamage)}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-destructive">{num(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-primary-light/50 font-bold">
                        <td className="px-4 py-3" colSpan={2}>Tổng cộng</td>
                        <td className="px-4 py-3 text-right tabular-nums text-destructive">{num(report.receiptDamage)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-destructive">{num(report.careDamage)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-destructive">{num(report.totalDamage)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function PartnerReportBoard({ warehouses }: { warehouses: Warehouse[] }) {
  return (
    <Tabs defaultValue="damage">
      <div className="overflow-x-auto">
        <TabsList>
          <TabsTrigger value="profit-share" className="whitespace-nowrap">Chia sẻ lợi nhuận</TabsTrigger>
          <TabsTrigger value="damage" className="whitespace-nowrap">Hỏng hủy</TabsTrigger>
          <TabsTrigger value="order-errors" className="whitespace-nowrap">Đơn vận hành lỗi</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="profit-share" className="mt-4">
        <ComingSoon title="Báo cáo chia sẻ Lợi nhuận" />
      </TabsContent>
      <TabsContent value="damage" className="mt-4">
        <DamageReportTab warehouses={warehouses} />
      </TabsContent>
      <TabsContent value="order-errors" className="mt-4">
        <OperationErrorTab warehouses={warehouses} />
      </TabsContent>
    </Tabs>
  );
}
