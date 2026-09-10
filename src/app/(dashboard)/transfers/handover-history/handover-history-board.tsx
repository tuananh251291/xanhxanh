"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Warehouse = { id: string; code: string; name: string };
type Staff = { id: string; code: string; name: string; workplaceWarehouseId: string | null };
type ItemRow = { lotCode: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number; unqualifiedQuantity: number };
type Row = {
  id: string; code: string; createdAt: string; status: "PENDING" | "CONFIRMED" | "REJECTED"; isSurplus: boolean;
  staffId: string; staffCode: string; staffName: string; warehouseName: string | null;
  toUserName: string | null; confirmedAt: string | null; hasInspection: boolean;
  totalQuantity: number; totalUnqualifiedQuantity: number; totalContaminatedQuantity: number;
  items: ItemRow[];
};

const ALL_WAREHOUSE = "ALL";
const ALL_STAFF = "ALL";
const num = (n: number) => n.toLocaleString("vi-VN");

const STATUS_BADGE: Record<Row["status"], string> = {
  PENDING: "bg-warning-light text-warning-foreground",
  CONFIRMED: "bg-success-light text-success-foreground",
  REJECTED: "bg-danger-light text-destructive",
};
const STATUS_LABEL: Record<Row["status"], string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Từ chối",
};

export default function HandoverHistoryBoard({ warehouses, staffList }: { warehouses: Warehouse[]; staffList: Staff[] }) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSE);
  const [staffId, setStaffId] = useState(ALL_STAFF);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      if (staffId !== ALL_STAFF) params.set("staffId", staffId);
      const res = await fetch(`/api/transfers/handover-history?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } finally {
      setLoading(false);
    }
  }, [date, warehouseId, staffId]);

  useEffect(() => { load(); }, [load]);

  // NV hiện trong dropdown chỉ đúng cơ sở đang chọn (nếu có chọn) — tránh hiện lẫn NV cơ sở khác.
  const filteredStaff = useMemo(
    () => (warehouseId === ALL_WAREHOUSE ? staffList : staffList.filter((s) => s.workplaceWarehouseId === warehouseId)),
    [staffList, warehouseId]
  );

  useEffect(() => {
    if (staffId !== ALL_STAFF && !filteredStaff.some((s) => s.id === staffId)) setStaffId(ALL_STAFF);
  }, [filteredStaff, staffId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Ngày</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
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
          <div className="space-y-1">
            <Label className="text-xs">Nhân viên</Label>
            <Select
              items={[{ value: ALL_STAFF, label: "Tất cả nhân viên" }, ...filteredStaff.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))]}
              value={staffId}
              onValueChange={(v) => setStaffId((v as string) ?? ALL_STAFF)}
            >
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STAFF}>Tất cả nhân viên</SelectItem>
                {filteredStaff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!loading && (
        <p className="text-sm text-text-secondary">{rows.length} phiếu bàn giao trong ngày đã chọn</p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>Không có phiếu bàn giao nào khớp bộ lọc</p>
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
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">NV bàn giao</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Cơ sở</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Trạng thái</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL bàn giao</th>
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
                          <td className="px-4 py-3 font-mono text-text-secondary">
                            {r.code}
                            {r.isSurplus && <Badge className="bg-violet-light text-violet-foreground ml-1.5 align-middle">MM dư</Badge>}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{format(new Date(r.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-text-secondary">{r.staffCode}</span> — {r.staffName}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{r.warehouseName ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Badge className={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                            {r.hasInspection && (
                              <Badge className="bg-info-light text-info-foreground ml-1.5 align-middle">Đã kiểm tra</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-primary-strong">{num(r.totalQuantity)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-background border-b">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm mb-4">
                                <div>
                                  <p className="text-text-muted text-xs">Người xác nhận nhận</p>
                                  <p className="font-medium">{r.toUserName ?? "Chưa xác nhận"}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">Ngày xác nhận</p>
                                  <p className="font-medium">{r.confirmedAt ? format(new Date(r.confirmedAt), "dd/MM/yyyy HH:mm", { locale: vi }) : "—"}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">SL không đạt (tự khai)</p>
                                  <p className="font-medium tabular-nums">{num(r.totalUnqualifiedQuantity)}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted text-xs">SL nhiễm (kiểm tra)</p>
                                  <p className="font-medium tabular-nums">{num(r.totalContaminatedQuantity)}</p>
                                </div>
                              </div>

                              <p className="text-text-muted text-xs mb-2">Danh sách lô trong phiếu</p>
                              <div className="overflow-x-auto border border-divider rounded-md">
                                <table className="w-full text-xs">
                                  <thead className="bg-primary-light">
                                    <tr>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Mã lô</th>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Mã cây</th>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Quy cách</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">Số lượng</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">Không đạt</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.items.map((it, idx) => (
                                      <tr key={`${it.lotCode}-${idx}`} className="border-t border-divider even:bg-background odd:bg-card">
                                        <td className="px-3 py-1.5 font-mono">{it.lotCode}</td>
                                        <td className="px-3 py-1.5">{it.plantTypeCode} — {it.plantTypeName}</td>
                                        <td className="px-3 py-1.5">{it.stageCode}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{num(it.quantity)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{num(it.unqualifiedQuantity)}</td>
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
