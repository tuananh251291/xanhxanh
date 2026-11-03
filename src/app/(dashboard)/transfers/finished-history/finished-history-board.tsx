"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import { format, subDays } from "date-fns";
import { vi } from "date-fns/locale";
import { QUALITY_DEFECT_LABELS } from "@/lib/quality-defects";

type Warehouse = { id: string; code: string; name: string };
type ItemRow = {
  plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number;
  defectQuantities: number[] | null; defectTotal: number | null; passedQuantity: number | null;
};
type Status = "PENDING" | "CONFIRMED" | "REJECTED";
type Row = {
  id: string; code: string; transferredAt: string; confirmedAt: string | null; status: Status;
  sourceWarehouseName: string | null; sourceRoomName: string | null; toWarehouseName: string;
  fromUserCode: string; fromUserName: string; receivedByName: string | null; assignedToName: string | null;
  notes: string | null; receiveFeedback: string | null;
  totalQuantity: number; totalDefect: number | null; totalPassed: number | null;
  items: ItemRow[];
};

const ALL = "ALL";
const num = (n: number) => n.toLocaleString("vi-VN");
const STATUS_BADGE: Record<Status, string> = {
  PENDING: "bg-warning-light text-warning-foreground",
  CONFIRMED: "bg-success-light text-success-foreground",
  REJECTED: "bg-danger-light text-destructive",
};
const STATUS_LABEL: Record<Status, string> = { PENDING: "Chờ nhận", CONFIRMED: "Đã nhận", REJECTED: "Từ chối" };

export default function FinishedHistoryBoard({
  sourceWarehouses, finishedWarehouses,
}: { sourceWarehouses: Warehouse[]; finishedWarehouses: Warehouse[] }) {
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [sourceWarehouseId, setSourceWarehouseId] = useState(ALL);
  const [toWarehouseId, setToWarehouseId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [rows, setRows] = useState<Row[]>([]);
  // Bộ lọc (query string) của lần tải gần nhất — khác bộ lọc hiện tại nghĩa là đang tải.
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (sourceWarehouseId !== ALL) params.set("sourceWarehouseId", sourceWarehouseId);
    if (toWarehouseId !== ALL) params.set("toWarehouseId", toWarehouseId);
    if (status !== ALL) params.set("status", status);
    return params.toString();
  }, [dateFrom, dateTo, sourceWarehouseId, toWarehouseId, status]);
  const loading = loadedQuery !== query;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/transfers/finished-history?${query}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setRows(Array.isArray(data.rows) ? data.rows : []); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoadedQuery(query); });
    return () => { cancelled = true; };
  }, [query]);

  const totals = rows.reduce(
    (acc, r) => ({ qty: acc.qty + r.totalQuantity, defect: acc.defect + (r.totalDefect ?? 0), passed: acc.passed + (r.totalPassed ?? 0) }),
    { qty: 0, defect: 0, passed: 0 },
  );

  const sourceItems = [{ value: ALL, label: "Tất cả khu sản xuất" }, ...sourceWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))];
  const finishedItems = [{ value: ALL, label: "Tất cả kho thành phẩm" }, ...finishedWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))];
  const statusItems = [{ value: ALL, label: "Tất cả trạng thái" }, ...(Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={dateTo} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} min={dateFrom} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Khu sản xuất</Label>
            <Select items={sourceItems} value={sourceWarehouseId} onValueChange={(v) => setSourceWarehouseId((v as string) ?? ALL)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {sourceItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {finishedWarehouses.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Kho thành phẩm</Label>
              <Select items={finishedItems} value={toWarehouseId} onValueChange={(v) => setToWarehouseId((v as string) ?? ALL)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {finishedItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Trạng thái</Label>
            <Select items={statusItems} value={status} onValueChange={(v) => setStatus((v as string) ?? ALL)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <Button
              disabled={loading || rows.length === 0}
              onClick={() => { window.location.href = `/api/transfers/finished-history/export?${query}`; }}
            >
              <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Xuất Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {!loading && (
        <p className="text-sm text-text-secondary">
          {rows.length} phiếu · Tổng bàn giao <span className="font-bold text-primary-strong">{num(totals.qty)}</span> cây
          · Lỗi {num(totals.defect)} · Đạt {num(totals.passed)} (tính trên phiếu đã đánh giá chất lượng)
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>Không có phiếu bàn giao thành phẩm nào khớp bộ lọc</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-2 py-3 text-primary-strong font-bold text-base"></th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã phiếu</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Thời gian</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Khu sản xuất</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">NV bàn giao</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Trạng thái</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL bàn giao</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL lỗi</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL đạt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = expanded === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          className="border-b last:border-0 even:bg-primary-light/30 cursor-pointer hover:bg-primary-light/50"
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                        >
                          <td className="px-2 py-3 text-text-muted">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-4 py-3 font-mono text-text-secondary">{r.code}</td>
                          <td className="px-4 py-3 text-text-secondary">{format(new Date(r.transferredAt), "dd/MM/yyyy HH:mm", { locale: vi })}</td>
                          <td className="px-4 py-3 text-foreground">{r.sourceWarehouseName ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-text-secondary">{r.fromUserCode}</span> — {r.fromUserName}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                            {r.receiveFeedback && <Badge variant="info" className="ml-1.5 align-middle">Có góp ý</Badge>}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-primary-strong">{num(r.totalQuantity)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{r.totalDefect === null ? "—" : num(r.totalDefect)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{r.totalPassed === null ? "—" : num(r.totalPassed)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-background border-b">
                            <td colSpan={9} className="px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm mb-4">
                                <div>
                                  <p className="text-text-muted text-xs">Phòng nguồn</p>
                                  <p className="font-medium">{r.sourceRoomName ?? "—"}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Kho thành phẩm nhận</p>
                                  <p className="font-medium">{r.toWarehouseName}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Người nhận / thời gian nhận</p>
                                  <p className="font-medium">
                                    {r.receivedByName ?? "Chưa nhận"}
                                    {r.confirmedAt && ` · ${format(new Date(r.confirmedAt), "dd/MM/yyyy HH:mm", { locale: vi })}`}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">NV được phân công</p>
                                  <p className="font-medium">{r.assignedToName ?? "—"}</p>
                                </div>
                                {r.notes && (
                                  <div className="col-span-2">
                                    <p className="text-text-muted text-xs">Ghi chú</p>
                                    <p className="font-medium whitespace-pre-wrap">{r.notes}</p>
                                  </div>
                                )}
                                {r.receiveFeedback && (
                                  <div className="col-span-2">
                                    <p className="text-text-muted text-xs">Góp ý Kho thành phẩm</p>
                                    <p className="font-medium whitespace-pre-wrap">{r.receiveFeedback}</p>
                                  </div>
                                )}
                              </div>

                              <div className="overflow-x-auto border border-divider rounded-md">
                                <table className="w-full text-xs">
                                  <thead className="bg-primary-light">
                                    <tr>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Mã cây</th>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Quy cách</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL bàn giao</th>
                                      {QUALITY_DEFECT_LABELS.map((l) => (
                                        <th key={l} className="text-right px-3 py-2 text-primary-strong font-bold text-sm">{l}</th>
                                      ))}
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">Tổng lỗi</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL đạt</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.items.map((it) => (
                                      <tr key={`${it.plantTypeCode}-${it.stageCode}`} className="border-t border-divider even:bg-background odd:bg-card">
                                        <td className="px-3 py-1.5"><span className="font-mono">{it.plantTypeCode}</span> — {it.plantTypeName}</td>
                                        <td className="px-3 py-1.5">{it.stageCode}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{num(it.quantity)}</td>
                                        {QUALITY_DEFECT_LABELS.map((l, idx) => (
                                          <td key={l} className="px-3 py-1.5 text-right tabular-nums">
                                            {it.defectQuantities ? num(it.defectQuantities[idx] ?? 0) : "—"}
                                          </td>
                                        ))}
                                        <td className="px-3 py-1.5 text-right tabular-nums">{it.defectTotal === null ? "—" : num(it.defectTotal)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums font-medium text-primary-strong">{it.passedQuantity === null ? "—" : num(it.passedQuantity)}</td>
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
