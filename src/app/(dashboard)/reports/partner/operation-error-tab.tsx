"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ExcelImportCard from "@/components/shared/excel-import-card";

type Warehouse = { id: string; code: string; name: string };
type Ticket = {
  id: string;
  code: string;
  occurredAt: string;
  description: string;
  costAmount: number;
  xanhxanhCost: number;
  partnerCost: number;
  warehouseName: string;
  createdByName: string;
};
type Report = {
  totalCount: number;
  totalCost: number;
  totalXanhxanhCost: number;
  totalPartnerCost: number;
  tickets: Ticket[];
  canEdit: boolean;
};

const ALL_WAREHOUSE = "ALL";
const num = (n: number) => n.toLocaleString("vi-VN");
const money = (n: number) => `${n.toLocaleString("vi-VN")} VNĐ`;

function StatCard({ title, value, color }: { title: string; value: string; color: "red" | "warning" | "success" }) {
  const colorMap = { red: "text-destructive", warning: "text-warning-foreground", success: "text-primary-strong" };
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-text-secondary">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${colorMap[color]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function AddTicketDialog({ warehouseId, warehouseName, onCreated }: { warehouseId: string; warehouseName: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [occurredAt, setOccurredAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState("");
  const [costAmount, setCostAmount] = useState<number | "">("");
  const [xanhxanhCost, setXanhxanhCost] = useState<number | "">("");

  const cost = typeof costAmount === "number" ? costAmount : 0;
  const xxCost = typeof xanhxanhCost === "number" ? xanhxanhCost : 0;
  const partnerCost = Math.max(0, cost - xxCost);

  const reset = () => {
    setOccurredAt(format(new Date(), "yyyy-MM-dd"));
    setDescription("");
    setCostAmount("");
    setXanhxanhCost("");
  };

  const submit = async () => {
    if (!description.trim()) { toast.error("Nhập Lỗi vận hành"); return; }
    if (typeof costAmount !== "number" || costAmount < 0) { toast.error("Nhập Chi phí phát sinh hợp lệ"); return; }
    if (xxCost > cost) { toast.error("Xanh Xanh chịu chi phí không được vượt quá Chi phí phát sinh"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/operation-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId, occurredAt, description: description.trim(), costAmount, xanhxanhCost: xxCost }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã thêm đơn vận hành lỗi");
      setOpen(false);
      reset();
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="bg-primary hover:bg-primary-hover" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" /> Thêm đơn lỗi
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm đơn vận hành lỗi — {warehouseName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label>Ngày xảy ra</Label>
            <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Lỗi vận hành</Label>
            <textarea
              rows={2}
              placeholder="VD: Gửi nhầm cây, gửi sai cây"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="space-y-1">
            <Label>Chi phí phát sinh (VNĐ)</Label>
            <Input
              type="number"
              min={0}
              value={costAmount}
              onChange={(e) => setCostAmount(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Xanh Xanh chịu chi phí (VNĐ)</Label>
            <Input
              type="number"
              min={0}
              value={xanhxanhCost}
              onChange={(e) => setXanhxanhCost(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <p className="text-sm text-text-secondary">
            Đối tác chịu chi phí (tự tính): <strong className="text-foreground">{money(partnerCost)}</strong>
          </p>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={saving} onClick={submit}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function OperationErrorTab({ warehouses }: { warehouses: Warehouse[] }) {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [warehouseId, setWarehouseId] = useState(warehouses.length === 1 ? warehouses[0].id : ALL_WAREHOUSE);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/operation-errors?${params}`);
      const data = await res.json();
      setReport(res.ok ? data : null);
    } finally {
      setLoading(false);
    }
  }, [month, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const selectedWarehouse = warehouseId !== ALL_WAREHOUSE ? warehouses.find((w) => w.id === warehouseId) : null;
  const canEdit = report?.canEdit ?? false;

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
          {canEdit && selectedWarehouse && (
            <div className="ml-auto">
              <AddTicketDialog warehouseId={selectedWarehouse.id} warehouseName={selectedWarehouse.name} onCreated={load} />
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && !selectedWarehouse && warehouses.length > 1 && (
        <p className="text-sm text-warning-foreground bg-warning-light rounded-md px-3 py-2 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Chọn 1 kho cụ thể ở trên để thêm hoặc nhập Excel đơn vận hành lỗi.
        </p>
      )}

      {canEdit && selectedWarehouse && (
        <ExcelImportCard
          icon={<Plus className="w-5 h-5" />}
          title="Nhập Excel đơn vận hành lỗi"
          description={`Mỗi dòng tạo 1 đơn vận hành lỗi cho kho ${selectedWarehouse.name} (Ngày xảy ra/Lỗi vận hành/Chi phí phát sinh/Xanh Xanh chịu chi phí — Đối tác chịu chi phí hệ thống tự tính).`}
          templateUrl="/api/operation-errors/template"
          uploadUrl="/api/operation-errors/import"
          extraFormData={{ warehouseId: selectedWarehouse.id }}
          successLabel={(count) => `Đã thêm ${count} đơn vận hành lỗi`}
        />
      )}

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Tổng đơn lỗi" value={num(report.totalCount)} color="red" />
            <StatCard title="Tổng chi phí phát sinh" value={money(report.totalCost)} color="warning" />
            <StatCard title="Xanh Xanh chịu chi phí" value={money(report.totalXanhxanhCost)} color="warning" />
            <StatCard title="Đối tác chịu chi phí" value={money(report.totalPartnerCost)} color="success" />
          </div>

          {report.tickets.length === 0 ? (
            <Card><CardContent className="py-16 text-center text-text-muted"><p>Không có đơn vận hành lỗi nào trong tháng này</p></CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã đơn lỗi</th>
                        <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Ngày xảy ra</th>
                        {warehouseId === ALL_WAREHOUSE && <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Kho</th>}
                        <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Lỗi vận hành</th>
                        <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Chi phí phát sinh</th>
                        <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Xanh Xanh chịu chi phí</th>
                        <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Đối tác chịu chi phí</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.tickets.map((t) => (
                        <tr key={t.id} className="border-b last:border-0 even:bg-primary-light/30">
                          <td className="px-4 py-3 font-mono text-text-secondary">{t.code}</td>
                          <td className="px-4 py-3 text-foreground tabular-nums">{format(new Date(t.occurredAt), "dd/MM/yyyy")}</td>
                          {warehouseId === ALL_WAREHOUSE && <td className="px-4 py-3 text-text-secondary">{t.warehouseName}</td>}
                          <td className="px-4 py-3 text-foreground">{t.description}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{num(t.costAmount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-warning-foreground">{num(t.xanhxanhCost)}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-primary-strong">{num(t.partnerCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-primary-light/50 font-bold">
                        <td className="px-4 py-3" colSpan={warehouseId === ALL_WAREHOUSE ? 4 : 3}>Tổng cộng</td>
                        <td className="px-4 py-3 text-right tabular-nums">{num(report.totalCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-warning-foreground">{num(report.totalXanhxanhCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-primary-strong">{num(report.totalPartnerCost)}</td>
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
