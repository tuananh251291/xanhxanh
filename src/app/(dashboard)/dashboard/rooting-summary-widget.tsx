"use client";

import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sprout, Eye } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type WarehouseSummary = {
  warehouseId: string; warehouseCode: string; warehouseName: string;
  todayQuantity: number; last7DaysQuantity: number;
  monthlyPlanQuantity: number; workingDaysInMonth: number; dailyTargetQuantity: number;
  deficitQuantity: number; // dương = còn thiếu, âm/0 = đã đạt hoặc vượt chỉ tiêu luỹ kế
};
type DailyBreakdownEntry = { date: string; byWarehouse: Record<string, number> };
type Warehouse = { id: string; code: string; name: string };

const num = (n: number) => n.toLocaleString("vi-VN");

export default function RootingSummaryWidget({
  warehouses, warehouseSummaries, dailyBreakdown,
}: {
  warehouses: Warehouse[];
  warehouseSummaries: WarehouseSummary[];
  dailyBreakdown: DailyBreakdownEntry[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sprout className="w-4 h-4 text-primary-strong" />
          Số lượng cây ra rễ 7 ngày gần nhất theo khu sản xuất
        </CardTitle>
        <CardAction>
          <Dialog>
            <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
              <Eye className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Chi tiết cây ra rễ theo ngày</DialogTitle>
              </DialogHeader>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Ngày</th>
                      {warehouses.map((w) => (
                        <th key={w.id} className="text-right px-3 py-2 text-primary-strong font-bold text-sm">{w.code}</th>
                      ))}
                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyBreakdown.map((d) => {
                      const total = warehouses.reduce((s, w) => s + (d.byWarehouse[w.id] ?? 0), 0);
                      return (
                        <tr key={d.date} className="border-b last:border-0 even:bg-primary-light/30">
                          <td className="px-3 py-2 text-text-secondary">
                            {format(new Date(`${d.date}T00:00:00`), "dd/MM (EEE)", { locale: vi })}
                          </td>
                          {warehouses.map((w) => (
                            <td key={w.id} className="px-3 py-2 text-right tabular-nums">{num(d.byWarehouse[w.id] ?? 0)}</td>
                          ))}
                          <td className="px-3 py-2 text-right font-bold tabular-nums text-primary-strong">{num(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {warehouseSummaries.map((w) => (
            <div key={w.warehouseId} className="p-3 rounded-lg bg-primary-light">
              <p className="text-sm text-text-secondary">{w.warehouseName} ({w.warehouseCode})</p>
              <p className="text-2xl font-bold text-primary-strong mt-1">{num(w.last7DaysQuantity)}</p>
              <p className="text-xs text-text-muted mt-0.5">Hôm nay: {num(w.todayQuantity)}</p>
              {w.monthlyPlanQuantity > 0 && (
                <div className="mt-2 pt-2 border-t border-divider">
                  <p className="text-xs text-text-muted">
                    Chỉ tiêu TB/ngày: <span className="font-medium text-foreground">{num(w.dailyTargetQuantity)} cây</span>
                  </p>
                  {w.deficitQuantity > 0 ? (
                    <p className="text-sm text-text-secondary mt-0.5">
                      Còn thiếu <span className="font-bold text-destructive">{num(w.deficitQuantity)}</span> cây để đạt chỉ tiêu
                    </p>
                  ) : (
                    <p className="text-sm font-bold text-success-foreground mt-0.5">
                      Đã vượt {num(-w.deficitQuantity)} cây so với chỉ tiêu
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
