"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Room = { id: string; code: string; name: string; warehouse: { code: string; name: string } };
type PlantType = { id: string; code: string; name: string };
type Supplier = { id: string; code: string; name: string };
type ProductionGarden = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };
type ItemRow = { key: string; plantTypeId: string; stageCode: string; quantityDelivered: string };

const STAGE_OPTIONS = [
  { value: "T01", label: "T01 (túi 1 cây)" },
  { value: "T05", label: "T05 (túi 5 cây)" },
  { value: "T10", label: "T10 (túi 10 cây)" },
];

let rowKeySeq = 0;
const newRow = (): ItemRow => ({ key: `r${++rowKeySeq}`, plantTypeId: "", stageCode: "T01", quantityDelivered: "" });

// Đơn vị cung cấp = ĐÚNG 1 trong 2: NCC ngoài (Supplier) hoặc khu sản xuất nội bộ (ProductionGarden) —
// gộp chung 1 combobox, value mã hoá tiền tố "s:"/"g:" để tách lại lúc gửi (xem GoodsReceipt.supplierId/
// productionGardenId, prisma/schema.prisma).
export default function GoodsReceiptForm({
  rooms, plantTypes, suppliers, gardens, title = "Dự kiến nhập hàng",
}: {
  rooms: Room[];
  plantTypes: PlantType[];
  suppliers: Supplier[];
  gardens: ProductionGarden[];
  title?: string;
}) {
  const [roomId, setRoomId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ItemRow[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const roomOptions: ComboOption[] = rooms.map((r) => ({ value: r.id, label: `${r.warehouse.name} — ${r.name}` }));
  const sourceOptions: ComboOption[] = [
    ...suppliers.map((s) => ({ value: `s:${s.id}`, label: `${s.code} - ${s.name}` })),
    ...gardens.map((g) => ({ value: `g:${g.id}`, label: `${g.code} - ${g.name} — Khu SX nội bộ` })),
  ];
  const plantTypeOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));

  const updateRow = (key: string, patch: Partial<ItemRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (key: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const reset = () => {
    setRoomId(""); setSourceId(""); setExpectedDate(""); setNotes(""); setRows([newRow()]);
  };

  const submit = async () => {
    if (!roomId) { toast.error("Chọn Phòng đạt tiêu chuẩn nhận hàng"); return; }
    if (!sourceId) { toast.error("Chọn đơn vị cung cấp"); return; }
    if (!expectedDate) { toast.error("Chọn ngày dự kiến nhập kho"); return; }

    const items: { plantTypeId: string; stageCode: string; estimatedQuantity: number }[] = [];
    for (const row of rows) {
      if (!row.plantTypeId && !row.quantityDelivered) continue;
      const estimated = Number(row.quantityDelivered);
      if (!row.plantTypeId) { toast.error("Cần chọn loại cây cho tất cả các dòng đã nhập số lượng"); return; }
      if (!estimated || estimated <= 0) { toast.error("Số lượng ước tính phải lớn hơn 0"); return; }
      items.push({ plantTypeId: row.plantTypeId, stageCode: row.stageCode, estimatedQuantity: estimated });
    }
    if (items.length === 0) { toast.error("Cần ít nhất 1 dòng kế hoạch hợp lệ"); return; }

    const [sourceType, sourceRealId] = sourceId.split(":");
    const body: Record<string, unknown> = {
      status: "PLANNED",
      ...(sourceType === "g" ? { productionGardenId: sourceRealId } : { supplierId: sourceRealId }),
      roomId,
      expectedDate,
      notes: notes.trim() || undefined,
      items,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã nhập dự kiến — phiếu ${json.code}`);
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
        <p className="text-xs text-text-secondary">
          Chưa có hàng thật — chỉ ghi ước tính, chưa cộng vào tồn kho. Xác nhận số liệu thật khi hàng về ở mục &quot;Nhận hàng từ NCC&quot;.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Phòng đạt tiêu chuẩn nhận hàng *</Label>
            <Select items={roomOptions} value={roomId} onValueChange={(v) => setRoomId(v as string)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
              <SelectContent>
                {roomOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Ngày dự kiến nhập kho *</Label>
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Đơn vị cung cấp *</Label>
            <Combobox
              items={sourceOptions}
              value={sourceOptions.find((o) => o.value === sourceId) ?? null}
              isItemEqualToValue={(a, b) => a.value === b.value}
              onValueChange={(v) => setSourceId(v?.value ?? "")}
            >
              <ComboboxInputGroup>
                <ComboboxInput placeholder="Gõ mã hoặc tên nhà cung cấp / khu sản xuất…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy đơn vị cung cấp</ComboboxEmpty>
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
                <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">SL ước tính (cây)</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
                  <td className="px-3 py-1.5">
                    <Input type="number" min={0} className="h-9 text-right" value={row.quantityDelivered} onChange={(e) => updateRow(row.key, { quantityDelivered: e.target.value })} placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} disabled={rows.length === 1}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
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
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarClock className="w-4 h-4 mr-2" />}
          Nhập dự kiến
        </Button>
      </CardContent>
    </Card>
  );
}
