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
import { Truck, PackageCheck, Loader2, Send, Check } from "lucide-react";
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
};

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

function SendTab() {
  const [shelves, setShelves] = useState<SendShelf[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [shelfOption, setShelfOption] = useState<ComboOption | null>(null);
  const [breakdownOption, setBreakdownOption] = useState<ComboOption | null>(null);
  const [destOption, setDestOption] = useState<ComboOption | null>(null);
  const [quantity, setQuantity] = useState("");
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
  const selectedShelf = shelfOption ? shelfByCode.get(shelfOption.value) ?? null : null;

  const shelfOptions = useMemo(
    () => shelves.map((s) => ({ value: s.code, label: `${s.code} — ${s.name} — ${s.used.toLocaleString("vi-VN")} cụm` })),
    [shelves]
  );

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
  const selectedBreakdown = breakdownOption ? breakdownByKey.get(breakdownOption.value) ?? null : null;

  const destOptions = useMemo(() => destinations.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` })), [destinations]);

  const resetForm = () => {
    setShelfOption(null);
    setBreakdownOption(null);
    setDestOption(null);
    setQuantity("");
    setNotes("");
  };

  const submit = async () => {
    if (!shelfOption) { toast.error("Chưa chọn giàn nguồn"); return; }
    if (!selectedBreakdown) { toast.error("Chưa chọn loại cây/quy cách"); return; }
    if (!destOption) { toast.error("Chưa chọn kho sản xuất đích"); return; }
    const qty = Number(quantity) || 0;
    if (qty <= 0 || qty > selectedBreakdown.available) {
      toast.error(`Số cụm bàn giao phải từ 1 đến ${selectedBreakdown.available.toLocaleString("vi-VN")}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/mother-warehouse-transfer/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromShelfCode: shelfOption.value,
          plantTypeId: selectedBreakdown.plantTypeId,
          stageCode: selectedBreakdown.stageCode,
          quantity: qty,
          toWarehouseId: destOption.value,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã gửi phiếu ${json.transferCode} — ${qty.toLocaleString("vi-VN")} cụm tới ${json.toWarehouseName}`, {
        description: "Chờ kho đích xác nhận số lượng thực tế nhận được.",
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-sm">Giàn nguồn</Label>
            <Combobox
              items={shelfOptions}
              value={shelfOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => { setShelfOption(v); setBreakdownOption(null); setQuantity(""); }}
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
              value={breakdownOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => { setBreakdownOption(v); setQuantity(""); }}
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
          <div className="space-y-1">
            <Label className="text-sm">Số lượng bàn giao (cụm)</Label>
            <Input
              type="number"
              min={1}
              max={selectedBreakdown?.available}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={selectedBreakdown ? `Tối đa ${selectedBreakdown.available.toLocaleString("vi-VN")}` : "Chọn loại cây trước"}
              disabled={!selectedBreakdown}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-sm">Ghi chú (tuỳ chọn)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD lý do bàn giao…" />
        </div>

        <p className="text-xs text-text-muted">
          Tồn giàn nguồn sẽ bị trừ ngay khi bấm &quot;Bàn giao&quot; — kho đích xác nhận số lượng thực tế
          nhận được mới cộng vào tồn kho của họ.
        </p>

        <Button className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Bàn giao
        </Button>
      </CardContent>
    </Card>
  );
}

function IncomingRowForm({ row, destShelves, onDone }: { row: IncomingRow; destShelves: DestShelf[]; onDone: () => void }) {
  const [shelfOption, setShelfOption] = useState<ComboOption | null>(null);
  const [actualQuantity, setActualQuantity] = useState(String(row.sentQuantity));
  const [submitting, setSubmitting] = useState(false);

  const shelfOptions = useMemo(() => destShelves.map((s) => ({ value: s.code, label: destShelfLabel(s) })), [destShelves]);
  const qtyNum = Number(actualQuantity);
  const shortfall = row.sentQuantity - (Number.isFinite(qtyNum) ? qtyNum : 0);

  const submit = async () => {
    const qty = Number(actualQuantity);
    if (!Number.isFinite(qty) || qty < 0 || qty > row.sentQuantity) {
      toast.error(`Số lượng thực nhận phải từ 0 đến ${row.sentQuantity.toLocaleString("vi-VN")}`);
      return;
    }
    if (qty > 0 && !shelfOption) { toast.error("Chưa chọn giàn đích"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/mother-warehouse-transfer/incoming/${row.transferId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toShelfCode: shelfOption?.value, actualQuantity: qty }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(
        qty > 0 ? `Đã nhận ${qty.toLocaleString("vi-VN")} cụm — lô mới ${json.createdLotCode}` : "Đã đóng phiếu — không nhận được cụm nào"
      );
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-divider bg-background p-3 space-y-3 mt-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-sm">Giàn đích (kho mình)</Label>
          <Combobox
            items={shelfOptions}
            value={shelfOption}
            isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
            onValueChange={setShelfOption}
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
        <div className="space-y-1">
          <Label className="text-sm">Số lượng thực tế nhận (cụm)</Label>
          <Input
            type="number"
            min={0}
            max={row.sentQuantity}
            value={actualQuantity}
            onChange={(e) => setActualQuantity(e.target.value)}
          />
        </div>
      </div>
      {shortfall > 0 && (
        <p className="text-xs text-warning-foreground bg-warning-light rounded p-2">
          Chênh lệch {shortfall.toLocaleString("vi-VN")} cụm sẽ được ghi nhận là hao hụt vận chuyển, báo
          cho NV đã gửi và Admin — không hoàn lại kho nguồn.
        </p>
      )}
      <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
        Xác nhận đã nhận
      </Button>
    </div>
  );
}

function IncomingTab() {
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

export default function MotherWarehouseTransferBoard() {
  return (
    <Tabs defaultValue="send">
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
