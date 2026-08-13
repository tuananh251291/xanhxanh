"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { ArrowLeftRight, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

type LotOnShelf = {
  code: string;
  quantity: number;
  stageCode: string;
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  lockedByInstructionCode: string | null;
};

type ShelfOption = {
  code: string;
  name: string;
  capacity: number | null;
  used: number;
  plantTypeCode: string | null;
  plantTypeName: string | null;
  assignedStaffName: string | null;
  allowedCodes: string[];
  rotationGroupName: string | null;
  lots: LotOnShelf[];
};

type ComboOption = { value: string; label: string };

function ownerText(s: ShelfOption): string {
  return s.assignedStaffName
    ? `${s.assignedStaffName} · ${s.plantTypeCode ?? "?"}`
    : s.allowedCodes.length > 0
      ? `Chung · nhận: ${s.allowedCodes.join(", ")}`
      : "Chung · mọi mã cây";
}

function shelfComboLabel(s: ShelfOption): string {
  const capText = s.capacity === null ? "không giới hạn" : `${s.used.toLocaleString("vi-VN")}/${s.capacity.toLocaleString("vi-VN")}`;
  return `${s.code} — ${s.name} — ${ownerText(s)} — ${capText}`;
}

export default function MotherStockReshelfBoard() {
  const [shelves, setShelves] = useState<ShelfOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromOption, setFromOption] = useState<ComboOption | null>(null);
  const [toOption, setToOption] = useState<ComboOption | null>(null);
  const [plantTypeOption, setPlantTypeOption] = useState<ComboOption | null>(null);
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mother-stock-reshelf");
      const data = await res.json();
      setShelves(Array.isArray(data.shelves) ? data.shelves : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shelfByCode = useMemo(() => new Map(shelves.map((s) => [s.code, s])), [shelves]);
  const fromShelf = fromOption ? shelfByCode.get(fromOption.value) ?? null : null;
  const toShelf = toOption ? shelfByCode.get(toOption.value) ?? null : null;

  const fromOptions = useMemo(
    () => shelves.filter((s) => s.used > 0).map((s) => ({ value: s.code, label: shelfComboLabel(s) })),
    [shelves]
  );
  const toOptions = useMemo(
    () => shelves.filter((s) => s.code !== fromOption?.value).map((s) => ({ value: s.code, label: shelfComboLabel(s) })),
    [shelves, fromOption]
  );

  // Giàn "chung" có thể đang chứa nhiều mã cây khác nhau cùng lúc — liệt kê các mã PHÂN BIỆT trên giàn
  // nguồn để bắt buộc chọn đúng mã muốn chuyển, tránh rút xuyên mã cây (xem moveMotherStock).
  const plantTypesOnFromShelf = useMemo(() => {
    const map = new Map<string, ComboOption>();
    fromShelf?.lots.forEach((l) => map.set(l.plantTypeId, { value: l.plantTypeId, label: `${l.plantTypeCode} — ${l.plantTypeName}` }));
    return Array.from(map.values());
  }, [fromShelf]);

  // Giàn chỉ có đúng 1 mã cây (giàn đã chia, hoặc giàn chung nhưng hiện chỉ tồn 1 mã) thì tự chọn ngầm,
  // không cần hỏi thêm — chỉ hiện Combobox chọn mã cây khi thật sự có nhiều hơn 1 lựa chọn.
  useEffect(() => {
    setPlantTypeOption(plantTypesOnFromShelf.length === 1 ? plantTypesOnFromShelf[0] : null);
  }, [plantTypesOnFromShelf]);

  const maxQtyForSelectedType = plantTypeOption
    ? (fromShelf?.lots.filter((l) => l.plantTypeId === plantTypeOption.value).reduce((s, l) => s + l.quantity, 0) ?? 0)
    : 0;

  const resetForm = () => {
    setFromOption(null);
    setToOption(null);
    setPlantTypeOption(null);
    setQuantity("");
  };

  const submit = async () => {
    if (!fromOption) { toast.error("Chưa chọn giàn nguồn"); return; }
    if (!toOption) { toast.error("Chưa chọn giàn đích"); return; }
    if (!plantTypeOption) { toast.error("Chưa chọn loại cây muốn chuyển"); return; }
    const qty = Number(quantity) || 0;
    if (qty <= 0 || qty > maxQtyForSelectedType) {
      toast.error(`Số cụm chuyển phải từ 1 đến ${maxQtyForSelectedType.toLocaleString("vi-VN")}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/mother-stock-reshelf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromShelfCode: fromOption.value,
          quantity: qty,
          toShelfCode: toOption.value,
          plantTypeId: plantTypeOption.value,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      const lotsText = (json.movedLots ?? [])
        .map((l: { lotCode: string; quantity: number }) => `${l.lotCode} (${l.quantity.toLocaleString("vi-VN")})`)
        .join(", ");
      toast.success(`Đã chuyển ${qty.toLocaleString("vi-VN")} cụm từ ${json.fromShelfCode} sang ${json.toShelfCode}`, {
        description: lotsText,
      });
      resetForm();
      load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" /> Chuyển mẫu mẹ giữa các giàn
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-sm">Giàn nguồn</Label>
              <Combobox
                items={fromOptions}
                value={fromOption}
                isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                onValueChange={(v) => { setFromOption(v); setQuantity(""); }}
              >
                <ComboboxInputGroup className="w-full h-9">
                  <ComboboxInput placeholder="Gõ mã hoặc tên giàn…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Không tìm thấy giàn đang có mẫu mẹ</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Giàn đích</Label>
              <Combobox
                items={toOptions}
                value={toOption}
                isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                onValueChange={setToOption}
              >
                <ComboboxInputGroup className="w-full h-9">
                  <ComboboxInput placeholder="Gõ mã hoặc tên giàn…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Không tìm thấy giàn</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
          </div>

          {fromShelf && (
            <div className="rounded-lg border border-divider bg-background p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">
                Giàn {fromShelf.code} đang có <strong>{fromShelf.used.toLocaleString("vi-VN")} cụm</strong> ({fromShelf.lots.length} lô)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-primary-light">
                      <th className="text-left px-2 py-1.5 text-base font-bold text-primary-strong">Mã lô</th>
                      <th className="text-left px-2 py-1.5 text-base font-bold text-primary-strong">Mã cây</th>
                      <th className="text-right px-2 py-1.5 text-base font-bold text-primary-strong">Số lượng</th>
                      <th className="text-left px-2 py-1.5 text-base font-bold text-primary-strong">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fromShelf.lots.map((l) => (
                      <tr key={l.code} className="border-b last:border-0 even:bg-primary-light">
                        <td className="px-2 py-1.5 font-mono text-xs text-text-secondary">{l.code}</td>
                        <td className="px-2 py-1.5">{l.plantTypeCode} — {l.plantTypeName}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{l.quantity.toLocaleString("vi-VN")} cụm</td>
                        <td className="px-2 py-1.5">
                          {l.lockedByInstructionCode ? (
                            <span className="inline-block rounded bg-warning-light px-1.5 py-0.5 text-warning-foreground font-medium text-xs whitespace-nowrap">
                              Đang chờ bàn giao CĐ {l.lockedByInstructionCode}
                            </span>
                          ) : (
                            <span className="text-text-muted text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {fromShelf.lots.some((l) => l.lockedByInstructionCode) && (
                <p className="text-xs text-warning-foreground">
                  Có lô đang là nguồn của chỉ định cấy chưa bàn giao — không thể sắp xếp cho tới khi Kỹ thuật hủy chỉ định đó hoặc Kho mô bàn giao xong.
                </p>
              )}
            </div>
          )}

          {plantTypesOnFromShelf.length > 1 && (
            <div className="space-y-1">
              <Label className="text-sm">Loại cây muốn chuyển</Label>
              <Combobox
                items={plantTypesOnFromShelf}
                value={plantTypeOption}
                isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                onValueChange={(v) => { setPlantTypeOption(v); setQuantity(""); }}
              >
                <ComboboxInputGroup className="w-full h-9">
                  <ComboboxInput placeholder="Gõ mã hoặc tên cây…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Không tìm thấy mã cây</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {plantTypeOption && (
                <p className="text-xs text-text-secondary">
                  Đang chuyển mã {plantTypeOption.label.split(" — ")[0]} — khả dụng {maxQtyForSelectedType.toLocaleString("vi-VN")}/{fromShelf?.used.toLocaleString("vi-VN")} cụm trên giàn này
                </p>
              )}
            </div>
          )}

          {toShelf && (
            <p className="text-sm text-text-secondary">
              Giàn đích {toShelf.code}: {ownerText(toShelf)} —{" "}
              {toShelf.capacity === null
                ? "không giới hạn sức chứa"
                : `còn trống ${Math.max(0, toShelf.capacity - toShelf.used).toLocaleString("vi-VN")}/${toShelf.capacity.toLocaleString("vi-VN")} cụm`}
              {" — "}
              {toShelf.rotationGroupName
                ? <>thuộc <strong>Nhóm tuần {toShelf.rotationGroupName}</strong>, hạn cấy chuyển tự tính theo lịch xoay vòng của Nhóm này</>
                : "chưa gán Nhóm tuần — không cần theo dõi hạn cấy chuyển"}
            </p>
          )}

          <div className="space-y-1">
            <Label className="text-sm">Số lượng muốn chuyển (cụm)</Label>
            <Input
              type="number"
              min={1}
              max={maxQtyForSelectedType}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={
                plantTypeOption
                  ? `Tối đa ${maxQtyForSelectedType.toLocaleString("vi-VN")}`
                  : fromShelf
                    ? "Chọn loại cây muốn chuyển trước"
                    : "Chọn giàn nguồn trước"
              }
              disabled={!plantTypeOption}
            />
          </div>

          <Button className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Xác nhận chuyển giàn
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
