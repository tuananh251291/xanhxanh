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

  const resetForm = () => {
    setFromOption(null);
    setToOption(null);
    setQuantity("");
  };

  const submit = async () => {
    if (!fromOption) { toast.error("Chưa chọn giàn nguồn"); return; }
    if (!toOption) { toast.error("Chưa chọn giàn đích"); return; }
    const qty = Number(quantity) || 0;
    const maxQty = fromShelf?.used ?? 0;
    if (qty <= 0 || qty > maxQty) { toast.error(`Số cụm chuyển phải từ 1 đến ${maxQty.toLocaleString("vi-VN")}`); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/mother-stock-reshelf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromShelfCode: fromOption.value,
          quantity: qty,
          toShelfCode: toOption.value,
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
              <div className="space-y-1">
                {fromShelf.lots.map((l) => (
                  <div key={l.code} className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                    <span className="font-mono">{l.code}</span>
                    <span className="truncate">{l.plantTypeCode} — {l.plantTypeName}</span>
                    <span className="shrink-0">{l.quantity.toLocaleString("vi-VN")} cụm</span>
                    {l.lockedByInstructionCode && (
                      <span className="shrink-0 rounded bg-warning-light px-1.5 py-0.5 text-warning-foreground font-medium">
                        Đang chờ bàn giao CĐ {l.lockedByInstructionCode}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {fromShelf.lots.some((l) => l.lockedByInstructionCode) && (
                <p className="text-xs text-warning-foreground">
                  Có lô đang là nguồn của chỉ định cấy chưa bàn giao — không thể sắp xếp cho tới khi Kỹ thuật hủy chỉ định đó hoặc Kho mô bàn giao xong.
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
              max={fromShelf?.used}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={fromShelf ? `Tối đa ${fromShelf.used.toLocaleString("vi-VN")}` : "Chọn giàn nguồn trước"}
              disabled={!fromShelf}
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
