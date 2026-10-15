"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Truck, PackageCheck, Loader2, Send, Check, Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type BreakdownRow = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; available: number };
type SendShelf = { code: string; name: string; used: number; breakdown: BreakdownRow[] };
type Destination = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };

type DestShelf = {
  code: string;
  name: string;
  capacity: number | null;
  used: number;
  plantTypeCode: string | null;
  assignedStaffName: string | null;
  allowedCodes: string[];
  lots: { plantTypeCode: string; quantity: number }[];
};

// Giàn nhận được mã cây này không — khớp đúng điều kiện server kiểm tra ở confirmMotherStockReceipt:
// giàn gán riêng NV chỉ nhận đúng mã cây của giàn; giàn chung theo "Cho phép xếp" (tiền tố mã), rỗng = mọi mã.
function destShelfAccepts(s: DestShelf, plantTypeCode: string): boolean {
  if (s.assignedStaffName) return s.plantTypeCode === plantTypeCode;
  return s.allowedCodes.length === 0 || s.allowedCodes.some((c) => plantTypeCode.startsWith(c));
}

function destShelfFree(s: DestShelf): number {
  return s.capacity === null ? Infinity : Math.max(0, s.capacity - s.used);
}

// "Gợi ý giàn" — chia số cần xếp ra các giàn nhận được mã cây này, ưu tiên: giàn chung đang có sẵn đúng
// mã cây → giàn chung chỉ định riêng mã cây (Cho phép xếp) → giàn chung nhận mọi mã → giàn gán riêng NV
// đúng mã cây (đang là giàn làm việc của NV, xếp sau cùng). Cùng nhóm thì giàn trống nhiều hơn trước để
// dùng ít giàn nhất. Trả về phần chưa xếp được (remaining > 0 = các giàn không đủ chỗ).
function suggestPlacements(shelves: DestShelf[], plantTypeCode: string, total: number) {
  const rank = (s: DestShelf) =>
    s.assignedStaffName ? 3
    : s.lots.some((l) => l.plantTypeCode === plantTypeCode) ? 0
    : s.allowedCodes.length > 0 ? 1
    : 2;
  const candidates = shelves
    .filter((s) => destShelfAccepts(s, plantTypeCode) && destShelfFree(s) > 0)
    .sort((a, b) => rank(a) - rank(b) || destShelfFree(b) - destShelfFree(a));
  const out: { shelf: DestShelf; quantity: number }[] = [];
  let remaining = total;
  for (const s of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, destShelfFree(s));
    out.push({ shelf: s, quantity: take });
    remaining -= take;
  }
  return { placements: out, remaining };
}

type IncomingRow = {
  transferId: string;
  code: string;
  transferredAt: string;
  fromWarehouseCode: string | null;
  fromWarehouseName: string | null;
  fromUserCode: string;
  fromUserName: string;
  plantTypeCode: string | null;
  plantTypeName: string | null;
  stageCode: string | null;
  sentQuantity: number;
};

function destShelfOwnerText(s: DestShelf): string {
  return s.assignedStaffName
    ? `${s.assignedStaffName} · ${s.plantTypeCode ?? "?"}`
    : s.allowedCodes.length > 0
      ? `Chung · nhận: ${s.allowedCodes.join(", ")}`
      : "Chung · mọi mã cây";
}

function destShelfLabel(s: DestShelf): string {
  const capText = s.capacity === null ? "không giới hạn" : `${s.used.toLocaleString("vi-VN")}/${s.capacity.toLocaleString("vi-VN")}`;
  return `${s.code} — ${s.name} — ${destShelfOwnerText(s)} — ${capText}`;
}

type SendLine = { id: number; shelfOption: ComboOption | null; breakdownOption: ComboOption | null; quantity: string };

let sendLineSeq = 0;
const newSendLine = (): SendLine => ({ id: ++sendLineSeq, shelfOption: null, breakdownOption: null, quantity: "" });

function lineKey(line: SendLine): string | null {
  return line.shelfOption && line.breakdownOption ? `${line.shelfOption.value}|${line.breakdownOption.value}` : null;
}

function SendLineRow({
  index,
  line,
  shelves,
  shelfOptions,
  usedByOthers,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  line: SendLine;
  shelves: Map<string, SendShelf>;
  shelfOptions: ComboOption[];
  usedByOthers: number;
  canRemove: boolean;
  onChange: (patch: Partial<SendLine>) => void;
  onRemove: () => void;
}) {
  const selectedShelf = line.shelfOption ? shelves.get(line.shelfOption.value) ?? null : null;
  const breakdownByKey = useMemo(
    () => new Map((selectedShelf?.breakdown ?? []).map((b) => [`${b.plantTypeId}|${b.stageCode}`, b])),
    [selectedShelf]
  );
  const breakdownOptions = useMemo(
    () =>
      (selectedShelf?.breakdown ?? []).map((b) => ({
        value: `${b.plantTypeId}|${b.stageCode}`,
        label: `${b.plantTypeCode} — ${b.plantTypeName} (${b.stageCode}) — còn ${b.available.toLocaleString("vi-VN")} cụm`,
      })),
    [selectedShelf]
  );
  const selectedBreakdown = line.breakdownOption ? breakdownByKey.get(line.breakdownOption.value) ?? null : null;
  const maxQty = selectedBreakdown ? Math.max(0, selectedBreakdown.available - usedByOthers) : 0;

  return (
    <div className="rounded-lg border border-divider bg-background p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-primary-strong">Dòng {index + 1}</span>
        {canRemove && (
          <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={onRemove}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Xoá dòng
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem]">
        <div className="space-y-1">
          <Label className="text-sm">Giàn nguồn</Label>
          <Combobox
            items={shelfOptions}
            value={line.shelfOption}
            isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
            onValueChange={(v) => onChange({ shelfOption: v, breakdownOption: null, quantity: "" })}
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
          <Label className="text-sm">Loại cây / quy cách</Label>
          <Combobox
            items={breakdownOptions}
            value={line.breakdownOption}
            isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
            onValueChange={(v) => onChange({ breakdownOption: v, quantity: "" })}
          >
            <ComboboxInputGroup className="w-full h-9">
              <ComboboxInput placeholder={selectedShelf ? "Chọn loại cây…" : "Chọn giàn nguồn trước"} />
              <ComboboxTrigger />
            </ComboboxInputGroup>
            <ComboboxContent>
              <ComboboxEmpty>Không có loại cây nào khả dụng</ComboboxEmpty>
              <ComboboxList>
                {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Số lượng (cụm)</Label>
          <Input
            type="number"
            min={1}
            max={maxQty}
            value={line.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            placeholder={selectedBreakdown ? `Tối đa ${maxQty.toLocaleString("vi-VN")}` : "Chọn loại cây"}
            disabled={!selectedBreakdown}
          />
        </div>
      </div>
      {selectedBreakdown && usedByOthers > 0 && (
        <p className="text-xs text-text-muted">
          Dòng khác đã lấy {usedByOthers.toLocaleString("vi-VN")} cụm cùng giàn + loại cây/quy cách này — còn{" "}
          {maxQty.toLocaleString("vi-VN")} cụm cho dòng này.
        </p>
      )}
    </div>
  );
}

export function SendTab() {
  const [shelves, setShelves] = useState<SendShelf[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<SendLine[]>(() => [newSendLine()]);
  const [destOption, setDestOption] = useState<ComboOption | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mother-warehouse-transfer/send");
      const data = await res.json();
      setShelves(Array.isArray(data.shelves) ? data.shelves : []);
      setDestinations(Array.isArray(data.destinations) ? data.destinations : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shelfByCode = useMemo(() => new Map(shelves.map((s) => [s.code, s])), [shelves]);

  const shelfOptions = useMemo(
    () => shelves.map((s) => ({ value: s.code, label: `${s.code} — ${s.name} — ${s.used.toLocaleString("vi-VN")} cụm` })),
    [shelves]
  );

  const destOptions = useMemo(() => destinations.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` })), [destinations]);

  // Tổng SL các dòng theo giàn + loại cây/quy cách — để mỗi dòng biết phần tồn còn lại sau khi trừ các dòng khác
  const qtyByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      const key = lineKey(l);
      if (key) m.set(key, (m.get(key) ?? 0) + (Number(l.quantity) || 0));
    }
    return m;
  }, [lines]);

  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  const updateLine = (id: number, patch: Partial<SendLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: number) => setLines((prev) => prev.filter((l) => l.id !== id));
  const addLine = () => setLines((prev) => [...prev, newSendLine()]);

  const resetForm = () => {
    setLines([newSendLine()]);
    setDestOption(null);
    setNotes("");
  };

  const submit = async () => {
    if (!destOption) { toast.error("Chưa chọn kho sản xuất đích"); return; }
    for (const [i, l] of lines.entries()) {
      const label = `Dòng ${i + 1}`;
      if (!l.shelfOption) { toast.error(`${label}: chưa chọn giàn nguồn`); return; }
      if (!l.breakdownOption) { toast.error(`${label}: chưa chọn loại cây/quy cách`); return; }
      const qty = Number(l.quantity) || 0;
      if (qty <= 0 || !Number.isInteger(qty)) { toast.error(`${label}: số cụm bàn giao phải là số nguyên lớn hơn 0`); return; }
    }
    for (const [key, qty] of qtyByKey) {
      const [shelfCode, plantTypeId, stageCode] = key.split("|");
      const b = shelfByCode.get(shelfCode)?.breakdown.find((x) => x.plantTypeId === plantTypeId && x.stageCode === stageCode);
      if (!b || qty > b.available) {
        toast.error(
          `Giàn ${shelfCode} — ${b?.plantTypeCode ?? "?"} (${stageCode}): tổng ${qty.toLocaleString("vi-VN")} cụm vượt tồn còn ${(b?.available ?? 0).toLocaleString("vi-VN")} cụm`
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/mother-warehouse-transfer/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => {
            const [plantTypeId, stageCode] = l.breakdownOption!.value.split("|");
            return { fromShelfCode: l.shelfOption!.value, plantTypeId, stageCode, quantity: Number(l.quantity) };
          }),
          toWarehouseId: destOption.value,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      const transfers: { transferCode: string }[] = json.transfers ?? [];
      toast.success(
        `Đã gửi ${transfers.length} phiếu (${transfers.map((t) => t.transferCode).join(", ")}) — ${totalQty.toLocaleString("vi-VN")} cụm tới ${json.toWarehouseName}`,
        { description: "Chờ kho đích xác nhận số lượng thực tế nhận được." }
      );
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Send className="w-4 h-4" /> Gửi mẫu mẹ sang kho sản xuất khác
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {destinations.length === 0 && (
          <p className="text-sm text-warning-foreground bg-warning-light rounded-lg p-3">
            Chưa có kho sản xuất nào khác để bàn giao — cần Admin tạo thêm kho sản xuất trước.
          </p>
        )}
        <div className="space-y-1">
          <Label className="text-sm">Kho sản xuất đích</Label>
          <Combobox
            items={destOptions}
            value={destOption}
            isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
            onValueChange={setDestOption}
          >
            <ComboboxInputGroup className="w-full h-9">
              <ComboboxInput placeholder="Gõ mã hoặc tên kho…" />
              <ComboboxTrigger />
            </ComboboxInputGroup>
            <ComboboxContent>
              <ComboboxEmpty>Không có kho sản xuất khác</ComboboxEmpty>
              <ComboboxList>
                {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => {
            const key = lineKey(l);
            const usedByOthers = key ? (qtyByKey.get(key) ?? 0) - (Number(l.quantity) || 0) : 0;
            return (
              <SendLineRow
                key={l.id}
                index={i}
                line={l}
                shelves={shelfByCode}
                shelfOptions={shelfOptions}
                usedByOthers={usedByOthers}
                canRemove={lines.length > 1}
                onChange={(patch) => updateLine(l.id, patch)}
                onRemove={() => removeLine(l.id)}
              />
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm dòng
            </Button>
            <span className="text-sm text-text-secondary">
              {lines.length} dòng — tổng <strong>{totalQty.toLocaleString("vi-VN")} cụm</strong>
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-sm">Ghi chú (tuỳ chọn)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD lý do bàn giao…" />
        </div>

        <p className="text-xs text-text-muted">
          Mỗi dòng tạo 1 phiếu bàn giao riêng. Tồn giàn nguồn sẽ bị trừ ngay khi bấm &quot;Bàn giao&quot; — kho
          đích xác nhận số lượng thực tế nhận được mới cộng vào tồn kho của họ.
        </p>

        <Button className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Bàn giao
        </Button>
      </CardContent>
    </Card>
  );
}

type PlacementLine = { id: number; shelfOption: ComboOption | null; quantity: string };

let placementSeq = 0;
const newPlacement = (shelfOption: ComboOption | null = null, quantity = ""): PlacementLine => ({ id: ++placementSeq, shelfOption, quantity });

// Số thực nhận xếp ra 1 hoặc nhiều giàn — tổng các dòng = số lượng thực tế nhận (xem
// confirmMotherStockReceipt). Chỉ liệt kê giàn nhận được đúng mã cây của phiếu.
function IncomingRowForm({ row, destShelves, onDone }: { row: IncomingRow; destShelves: DestShelf[]; onDone: () => void }) {
  const [lines, setLines] = useState<PlacementLine[]>(() => [newPlacement(null, String(row.sentQuantity))]);
  const [submitting, setSubmitting] = useState(false);

  const plantTypeCode = row.plantTypeCode ?? "";
  const eligibleShelves = useMemo(() => destShelves.filter((s) => destShelfAccepts(s, plantTypeCode)), [destShelves, plantTypeCode]);
  const shelfByCode = useMemo(() => new Map(destShelves.map((s) => [s.code, s])), [destShelves]);
  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const shortfall = row.sentQuantity - totalQty;

  const updateLine = (id: number, patch: Partial<PlacementLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const applySuggestion = () => {
    const { placements, remaining } = suggestPlacements(eligibleShelves, plantTypeCode, row.sentQuantity);
    if (placements.length === 0) {
      toast.error(`Không còn giàn nào trống nhận được mã ${plantTypeCode} — liên hệ Admin cao nhất thêm giàn/tăng sức chứa`);
      return;
    }
    setLines(placements.map((p) => newPlacement({ value: p.shelf.code, label: destShelfLabel(p.shelf) }, String(p.quantity))));
    if (remaining > 0) {
      toast.warning(`Các giàn còn trống chỉ xếp được ${(row.sentQuantity - remaining).toLocaleString("vi-VN")} cụm — còn thiếu chỗ cho ${remaining.toLocaleString("vi-VN")} cụm`);
    } else {
      toast.success(`Đã gợi ý ${placements.length} giàn — kiểm tra lại rồi bấm Xác nhận`);
    }
  };

  const submit = async () => {
    const placements: { toShelfCode: string; quantity: number }[] = [];
    for (const [i, l] of lines.entries()) {
      if (l.quantity.trim() === "" && !l.shelfOption) continue;
      const qty = Number(l.quantity);
      if (!Number.isInteger(qty) || qty < 0) { toast.error(`Dòng ${i + 1}: số cụm không hợp lệ`); return; }
      if (qty === 0) continue;
      if (!l.shelfOption) { toast.error(`Dòng ${i + 1}: chưa chọn giàn đích`); return; }
      placements.push({ toShelfCode: l.shelfOption.value, quantity: qty });
    }
    const total = placements.reduce((s, p) => s + p.quantity, 0);
    if (total > row.sentQuantity) {
      toast.error(`Tổng thực nhận (${total.toLocaleString("vi-VN")}) vượt quá số đã gửi (${row.sentQuantity.toLocaleString("vi-VN")})`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/mother-warehouse-transfer/incoming/${row.transferId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(
        total > 0
          ? `Đã nhận ${total.toLocaleString("vi-VN")} cụm — lô mới ${(json.createdLotCodes as string[]).join(", ")}`
          : "Đã đóng phiếu — không nhận được cụm nào"
      );
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-divider bg-background p-3 space-y-3 mt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">Xếp số thực nhận lên 1 hoặc nhiều giàn của kho mình</p>
        <Button type="button" size="sm" variant="outline" onClick={applySuggestion}>
          <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Gợi ý giàn
        </Button>
      </div>
      {lines.map((l, i) => {
        const chosenElsewhere = new Set(lines.filter((o) => o.id !== l.id && o.shelfOption).map((o) => o.shelfOption!.value));
        const options = eligibleShelves
          .filter((s) => !chosenElsewhere.has(s.code))
          .map((s) => ({ value: s.code, label: destShelfLabel(s) }));
        const shelf = l.shelfOption ? shelfByCode.get(l.shelfOption.value) : undefined;
        const free = shelf ? destShelfFree(shelf) : Infinity;
        const qty = Number(l.quantity) || 0;
        return (
          <div key={l.id} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] items-start">
            <div className="space-y-1">
              <Label className="text-sm">Giàn đích {lines.length > 1 ? i + 1 : ""}</Label>
              <Combobox
                items={options}
                value={l.shelfOption}
                isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                onValueChange={(v) => updateLine(l.id, { shelfOption: v })}
              >
                <ComboboxInputGroup className="w-full h-9">
                  <ComboboxInput placeholder="Gõ mã hoặc tên giàn…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Không có giàn nào nhận được mã {plantTypeCode}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {shelf && (
                <p className={`text-xs ${qty > free ? "text-destructive font-medium" : "text-text-muted"}`}>
                  Còn trống {free === Infinity ? "không giới hạn" : `${free.toLocaleString("vi-VN")} cụm`}
                  {qty > free && " — vượt chỗ trống, giảm số cụm hoặc thêm giàn khác"}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Số cụm</Label>
              <Input type="number" min={0} className="h-9" value={l.quantity} onChange={(e) => updateLine(l.id, { quantity: e.target.value })} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="sm:mt-6"
              disabled={lines.length === 1}
              onClick={() => setLines((prev) => prev.filter((o) => o.id !== l.id))}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, newPlacement()])}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm giàn
        </Button>
        <span className="text-sm text-text-secondary">
          Tổng thực nhận <strong>{totalQty.toLocaleString("vi-VN")}</strong> / {row.sentQuantity.toLocaleString("vi-VN")} cụm đã gửi
        </span>
      </div>
      {shortfall > 0 && (
        <p className="text-xs text-warning-foreground bg-warning-light rounded p-2">
          Chênh lệch {shortfall.toLocaleString("vi-VN")} cụm sẽ được ghi nhận là hao hụt vận chuyển, báo
          cho NV đã gửi và Admin — không hoàn lại kho nguồn. Nếu thực tế nhận đủ mà thiếu chỗ, bấm
          &quot;Thêm giàn&quot; hoặc &quot;Gợi ý giàn&quot; để xếp phần còn lại.
        </p>
      )}
      {shortfall < 0 && (
        <p className="text-xs text-destructive bg-danger-light rounded p-2">
          Tổng thực nhận vượt quá số đã gửi {(-shortfall).toLocaleString("vi-VN")} cụm.
        </p>
      )}
      <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={submitting || shortfall < 0} onClick={submit}>
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
        Xác nhận đã nhận
      </Button>
    </div>
  );
}

export function IncomingTab() {
  const [rows, setRows] = useState<IncomingRow[]>([]);
  const [destShelves, setDestShelves] = useState<DestShelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rowsRes, shelvesRes] = await Promise.all([
        fetch("/api/mother-warehouse-transfer/incoming"),
        fetch("/api/mother-stock-reshelf"),
      ]);
      const rowsData = await rowsRes.json();
      const shelvesData = await shelvesRes.json();
      setRows(Array.isArray(rowsData) ? rowsData : []);
      setDestShelves(Array.isArray(shelvesData.shelves) ? shelvesData.shelves : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (rows.length === 0) {
    return (
      <Card><CardContent className="py-16 text-center text-text-muted">
        <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
        <p>Không có phiếu bàn giao mẫu mẹ liên kho nào đang chờ</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.transferId}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-sm text-text-secondary">
                  {row.code}
                  <span className="ml-2 text-xs text-text-muted font-sans">
                    {format(new Date(row.transferredAt), "dd/MM/yyyy HH:mm", { locale: vi })}
                  </span>
                </p>
                <p className="text-sm text-foreground">
                  Từ <strong>{row.fromWarehouseName ?? row.fromWarehouseCode}</strong> — {row.fromUserName} ({row.fromUserCode})
                </p>
                <p className="text-sm text-text-secondary">
                  {row.plantTypeCode} — {row.plantTypeName} ({row.stageCode}) —{" "}
                  <strong>{row.sentQuantity.toLocaleString("vi-VN")} cụm</strong> đã gửi
                </p>
              </div>
              {openRowId !== row.transferId && (
                <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" onClick={() => setOpenRowId(row.transferId)}>
                  <PackageCheck className="w-3.5 h-3.5 mr-1.5" /> Nhận hàng
                </Button>
              )}
            </div>
            {openRowId === row.transferId && (
              <IncomingRowForm row={row} destShelves={destShelves} onDone={() => { setOpenRowId(null); load(); }} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function MotherWarehouseTransferBoard({ defaultTab = "send" }: { defaultTab?: string }) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="send" className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Gửi đi</TabsTrigger>
        <TabsTrigger value="incoming" className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Nhận về</TabsTrigger>
      </TabsList>
      <TabsContent value="send" className="mt-4">
        <SendTab />
      </TabsContent>
      <TabsContent value="incoming" className="mt-4">
        <IncomingTab />
      </TabsContent>
    </Tabs>
  );
}
