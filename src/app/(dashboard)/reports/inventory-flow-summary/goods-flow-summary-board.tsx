"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { format, subDays } from "date-fns";

type Warehouse = { id: string; code: string; name: string };
type SupplierRow = { supplierId: string; supplierCode: string; supplierName: string; receiptCount: number; totalDelivered: number; totalPassed: number };
type OrderRow = { customerCode: string; orderCount: number; totalQuantity: number };
type ProductionRow = { roomId: string; roomName: string; transferCount: number; totalQuantity: number };
type ProposalRow = { type: "TRONG" | "HUY"; plantTypeCode: string; plantTypeName: string; proposalCount: number; totalQuantity: number };
type Summary = { totalIn: number; totalOut: number; totalOutOrders: number; totalOutProduction: number; totalOutProposal: number };

const ALL_WAREHOUSE = "ALL";
const PROPOSAL_TYPE_LABELS: Record<"TRONG" | "HUY", string> = { TRONG: "Trồng lại", HUY: "Hủy" };

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-text-muted">{text}</td></tr>;
}

export default function GoodsFlowSummaryBoard({
  warehouses, showWarehouseFilter,
}: {
  warehouses: Warehouse[];
  showWarehouseFilter: boolean;
}) {
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSE);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [incomingBySupplier, setIncomingBySupplier] = useState<SupplierRow[]>([]);
  const [outgoingByOrder, setOutgoingByOrder] = useState<OrderRow[]>([]);
  const [outgoingByProduction, setOutgoingByProduction] = useState<ProductionRow[]>([]);
  const [outgoingByProposal, setOutgoingByProposal] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/reports/inventory-flow-summary?${params}`);
      const data = await res.json();
      setSummary(data.summary ?? null);
      setIncomingBySupplier(Array.isArray(data.incomingBySupplier) ? data.incomingBySupplier : []);
      setOutgoingByOrder(Array.isArray(data.outgoingByOrder) ? data.outgoingByOrder : []);
      setOutgoingByProduction(Array.isArray(data.outgoingByProduction) ? data.outgoingByProduction : []);
      setOutgoingByProposal(Array.isArray(data.outgoingByProposal) ? data.outgoingByProposal : []);
    } finally {
      setLoading(false);
    }
  }, [from, to, warehouseId]);

  useEffect(() => { load(); }, [load]);

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
          {showWarehouseFilter && (
            <div className="space-y-1">
              <Label className="text-xs">Kho thành phẩm</Label>
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

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-success-light p-2.5 rounded-lg shrink-0">
                    <ArrowDownCircle className="w-6 h-6 text-success-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary">Tổng số lượng nhập</p>
                    <p className="text-2xl font-bold text-foreground">{summary.totalIn.toLocaleString("vi-VN")}</p>
                    <p className="text-xs text-text-muted mt-0.5">Đã ghi nhận từ NCC (đạt tiêu chuẩn)</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-danger-light p-2.5 rounded-lg shrink-0">
                    <ArrowUpCircle className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary">Tổng số lượng xuất</p>
                    <p className="text-2xl font-bold text-foreground">{summary.totalOut.toLocaleString("vi-VN")}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Đơn hàng {summary.totalOutOrders.toLocaleString("vi-VN")} · Khu SX {summary.totalOutProduction.toLocaleString("vi-VN")} · Trồng/hủy {summary.totalOutProposal.toLocaleString("vi-VN")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Tabs defaultValue="supplier">
            <TabsList>
              <TabsTrigger value="supplier">Nhập theo NCC</TabsTrigger>
              <TabsTrigger value="order">Xuất đơn hàng</TabsTrigger>
              <TabsTrigger value="production">Xuất khu sản xuất</TabsTrigger>
              <TabsTrigger value="proposal">Xuất trồng/hủy</TabsTrigger>
            </TabsList>

            <TabsContent value="supplier" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-light">
                          <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Nhà cung cấp</th>
                          <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số phiếu</th>
                          <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tổng nhận</th>
                          <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Được ghi nhận</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomingBySupplier.length === 0 ? (
                          <EmptyRow colSpan={4} text="Không có phiếu nhập NCC nào khớp bộ lọc" />
                        ) : incomingBySupplier.map((r) => (
                          <tr key={r.supplierId} className="border-b last:border-0 even:bg-primary-light/30">
                            <td className="px-4 py-3 font-medium text-foreground">{r.supplierName} <span className="font-mono text-xs text-text-muted">({r.supplierCode})</span></td>
                            <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{r.receiptCount}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{r.totalDelivered.toLocaleString("vi-VN")}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-primary-strong">{r.totalPassed.toLocaleString("vi-VN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="order" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-light">
                          <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Khách hàng</th>
                          <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số đơn</th>
                          <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng xuất</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outgoingByOrder.length === 0 ? (
                          <EmptyRow colSpan={3} text="Không có đơn hàng nào đã xuất trong bộ lọc" />
                        ) : outgoingByOrder.map((r) => (
                          <tr key={r.customerCode} className="border-b last:border-0 even:bg-primary-light/30">
                            <td className="px-4 py-3 font-mono text-foreground">{r.customerCode}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{r.orderCount}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-destructive">{r.totalQuantity.toLocaleString("vi-VN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="production" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-light">
                          <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Phòng đích</th>
                          <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số phiếu</th>
                          <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng xuất</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outgoingByProduction.length === 0 ? (
                          <EmptyRow colSpan={3} text="Không có phiếu trả hàng khu sản xuất nào khớp bộ lọc" />
                        ) : outgoingByProduction.map((r) => (
                          <tr key={r.roomId} className="border-b last:border-0 even:bg-primary-light/30">
                            <td className="px-4 py-3 font-medium text-foreground">{r.roomName}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{r.transferCount}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-destructive">{r.totalQuantity.toLocaleString("vi-VN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="proposal" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-light">
                          <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Loại</th>
                          <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Loại cây</th>
                          <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số đề xuất</th>
                          <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng xuất</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outgoingByProposal.length === 0 ? (
                          <EmptyRow colSpan={4} text="Không có đề xuất trồng/hủy nào đã duyệt trong bộ lọc" />
                        ) : outgoingByProposal.map((r) => (
                          <tr key={`${r.type}:${r.plantTypeCode}`} className="border-b last:border-0 even:bg-primary-light/30">
                            <td className="px-4 py-3 text-foreground">{PROPOSAL_TYPE_LABELS[r.type]}</td>
                            <td className="px-4 py-3 text-foreground">{r.plantTypeName} <span className="font-mono text-xs text-text-muted">({r.plantTypeCode})</span></td>
                            <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{r.proposalCount}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-destructive">{r.totalQuantity.toLocaleString("vi-VN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
