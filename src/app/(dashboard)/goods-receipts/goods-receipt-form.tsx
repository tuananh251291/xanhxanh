"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Plus, Trash2, Truck, CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Room = { id: string; code: string; name: string; warehouse: { code: string; name: string } };
type PlantType = { id: string; code: string; name: string };
type Supplier = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };
type ItemRow = { key: string; plantTypeId: string; stageCode: string; quantityDelivered: string; quantityRejected: string };

const STAGE_OPTIONS = [
  { value: "T01", label: "T01 (túi 1 cây)" },
  { value: "T05", label: "T05 (túi 5 cây)" },
  { value: "T10", label: "T10 (túi 10 cây)" },
];

const MODE_OPTIONS: { value: "CONFIRMED" | "PLANNED"; label: string }[] = [
  { value: "CONFIRMED", label: "Đã có hàng thật" },
  { value: "PLANNED", label: "Kế hoạch dự kiến" },
];

let rowKeySeq = 0;
const newRow = (): ItemRow => ({ key: `r${++rowKeySeq}`, plantTypeId: "", stageCode: "T01", quantityDelivered: "", quantityRejected: "" });

export default function GoodsReceiptForm({
  rooms, plantTypes, suppliers, defaultMode = "CONFIRMED", title = "Nhập hàng",
}: {
  rooms: Room[];
  plantTypes: PlantType[];
  suppliers: Supplier[];
  // "Phân công nhiệm vụ ngày" nhúng lại form này, mặc định "Kế hoạch dự kiến" vì mục đích chính ở đó là
  // tạo việc để gán cho NV — trang /goods-receipts gốc vẫn mặc định "Đã có hàng thật" như cũ.
  defaultMode?: "CONFIRMED" | "PLANNED";
  title?: string;
}) {
  const [mode, setMode] = useState<"CONFIRMED" | "PLANNED">(defaultMode);
  const [roomId, setRoomId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ItemRow[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const roomOptions: ComboOption[] = rooms.map((r) => ({ value: r.id, label: `${r.warehouse.name} — ${r.name}` }));
  const supplierOptions: ComboOption[] = suppliers.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }));
  const plantTypeOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));

  const updateRow = (key: string, patch: Partial<ItemRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (key: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const reset = () => {
    setRoomId(""); setSupplierId(""); setExpectedDate(""); setNotes(""); setRows([newRow()]);
  };

  const submit = async () => {
    if (!roomId) { toast.error("Chọn Phòng đạt tiêu chuẩn nhận hàng"); return; }
    if (!supplierId) { toast.error("Chọn nhà cung cấp"); return; }
    if (mode === "PLANNED" && !expectedDate) { toast.error("Chọn ngày dự kiến nhập kho"); return; }

    let body: Record<string, unknown>;
    if (mode === "PLANNED") {
      const items: { plantTypeId: string; stageCode: string; estimatedQuantity: number }[] = [];
      for (const row of rows) {
        if (!row.plantTypeId && !row.quantityDelivered) continue;
        const estimated = Number(row.quantityDelivered);
        if (!row.plantTypeId) { toast.error("Cần chọn loại cây cho tất cả các dòng đã nhập số lượng"); return; }
        if (!estimated || estimated <= 0) { toast.error("Số lượng ước tính phải lớn hơn 0"); return; }
        items.push({ plantTypeId: row.plantTypeId, stageCode: row.stageCode, estimatedQuantity: estimated });
      }
      if (items.length === 0) { toast.error("Cần ít nhất 1 dòng kế hoạch hợp lệ"); return; }
      body = { status: "PLANNED", supplierId, roomId, expectedDate, notes: notes.trim() || undefined, items };
    } else {
      const items: { plantTypeId: string; stageCode: string; quantityDelivered: number; quantityRejected: number }[] = [];
      for (const row of rows) {
        if (!row.plantTypeId && !row.quantityDelivered) continue;
        const delivered = Number(row.quantityDelivered);
        const rejected = Number(row.quantityRejected) || 0;
        if (!row.plantTypeId) { toast.error("Cần chọn loại cây cho tất cả các dòng đã nhập số lượng"); return; }
        if (!delivered || delivered <= 0) { toast.error("Số lượng bàn giao phải lớn hơn 0"); return; }
        if (rejected > delivered) { toast.error("Số lượng không đạt không được lớn hơn số lượng bàn giao"); return; }
        items.push({ plantTypeId: row.plantTypeId, stageCode: row.stageCode, quantityDelivered: delivered, quantityRejected: rejected });
      }
      if (items.length === 0) { toast.error("Cần ít nhất 1 dòng nhập hàng hợp lệ"); return; }
      body = { status: "CONFIRMED", supplierId, roomId, notes: notes.trim() || undefined, items };
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(mode === "PLANNED" ? `Đã tạo kế hoạch nhập kho — phiếu ${json.code}` : `Đã nhập hàng — phiếu ${json.code}`);
      reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Loại phiếu</Label>
          <Select items={MODE_OPTIONS} value={mode} onValueChange={(v) => setMode(v as "CONFIRMED" | "PLANNED")}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {mode === "PLANNED" && (
            <p className="text-xs text-text-secondary">
              Chưa có hàng thật — chỉ ghi ước tính, chưa cộng vào tồn kho. Xác nhận số liệu thật khi hàng về ở mục &quot;Kế hoạch đang chờ hàng về&quot; bên dưới.
            </p>
          )}
        </div>

        <div className={`grid grid-cols-1 gap-3 ${mode === "PLANNED" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <div className="space-y-1">
            <Label>Phòng đạt tiêu chuẩn nhận hàng *</Label>
            <Select items={roomOptions} value={roomId} onValueChange={(v) => setRoomId(v as string)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
              <SelectContent>
                {roomOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {mode === "PLANNED" && (
            <div className="space-y-1">
              <Label>Ngày dự kiến nhập kho *</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Nhà cung cấp *</Label>
            <Combobox
              items={supplierOptions}
              value={supplierOptions.find((o) => o.value === supplierId) ?? null}
              isItemEqualToValue={(a, b) => a.value === b.value}
              onValueChange={(v) => setSupplierId(v?.value ?? "")}
            >
              <ComboboxInputGroup>
                <ComboboxInput placeholder="Gõ mã hoặc tên nhà cung cấp…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy nhà cung cấp</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </div>

        <div className="overflow-x-auto border border-divider rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Loại cây</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold w-32">Quy cách</th>
                {mode === "PLANNED" ? (
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">SL ước tính (cây)</th>
                ) : (
                  <>
                    <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">SL bàn giao (cây)</th>
                    <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">SL không đạt (cây)</th>
                    <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">SL đạt (cây)</th>
                  </>
                )}
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const delivered = Number(row.quantityDelivered) || 0;
                const rejected = Number(row.quantityRejected) || 0;
                const passed = Math.max(0, delivered - rejected);
                return (
                  <tr key={row.key} className="border-b last:border-0 even:bg-primary-light/30">
                    <td className="px-3 py-1.5">
                      <Combobox
                        items={plantTypeOptions}
                        value={plantTypeOptions.find((o) => o.value === row.plantTypeId) ?? null}
                        isItemEqualToValue={(a, b) => a.value === b.value}
                        onValueChange={(v) => updateRow(row.key, { plantTypeId: v?.value ?? "" })}
                      >
                        <ComboboxInputGroup className="h-9">
                          <ComboboxInput className="text-sm" placeholder="Gõ mã hoặc tên cây…" />
                          <ComboboxTrigger />
                        </ComboboxInputGroup>
                        <ComboboxContent>
                          <ComboboxEmpty>Không tìm thấy loại cây</ComboboxEmpty>
                          <ComboboxList>
                            {(item: ComboOption) => (
                              <ComboboxItem key={item.value} value={item} className="text-sm">{item.label}</ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </td>
                    <td className="px-3 py-1.5">
                      <Select items={STAGE_OPTIONS} value={row.stageCode} onValueChange={(v) => updateRow(row.key, { stageCode: v as string })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STAGE_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    {mode === "PLANNED" ? (
                      <td className="px-3 py-1.5">
                        <Input type="number" min={0} className="h-9 text-right" value={row.quantityDelivered} onChange={(e) => updateRow(row.key, { quantityDelivered: e.target.value })} placeholder="0" />
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-1.5">
                          <Input type="number" min={0} className="h-9 text-right" value={row.quantityDelivered} onChange={(e) => updateRow(row.key, { quantityDelivered: e.target.value })} placeholder="0" />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input type="number" min={0} className="h-9 text-right" value={row.quantityRejected} onChange={(e) => updateRow(row.key, { quantityRejected: e.target.value })} placeholder="0" />
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold text-foreground">{passed.toLocaleString("vi-VN")}</td>
                      </>
                    )}
                    <td className="px-2 py-1.5">
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} disabled={rows.length === 1}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="w-4 h-4 mr-1" /> Thêm dòng
        </Button>

        <div className="space-y-1 pt-2 border-t border-divider">
          <Label>Ghi chú</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: Số hoá đơn, phương tiện vận chuyển..." />
        </div>

        <Button className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
          {submitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : mode === "PLANNED" ? (
            <CalendarClock className="w-4 h-4 mr-2" />
          ) : (
            <Truck className="w-4 h-4 mr-2" />
          )}
          {mode === "PLANNED" ? "Tạo kế hoạch nhập kho" : "Nhập hàng"}
        </Button>
      </CardContent>
    </Card>
  );
}
