"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { FlaskConical, PackageCheck, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type ComboOption = { value: string; label: string };
type RndItem = { plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number };
type RndRow = {
  transferId: string;
  code: string;
  transferredAt: string;
  fromUserCode: string;
  fromUserName: string;
  stage: "MAU_ME" | "THANH_PHAM" | null;
  items: RndItem[];
  totalQuantity: number;
};
type DestShelf = {
  code: string; name: string; roomType: "PHONG_MAU_ME" | "PHONG_RA_RE" | null; capacity: number | null;
  used: number; plantTypeCode: string | null; assignedStaffName: string | null; allowedCodes: string[];
};
type DestRoom = { code: string; name: string; type: string };

function destShelfLabel(s: DestShelf): string {
  const capText = s.capacity === null ? "không giới hạn" : `${s.used.toLocaleString("vi-VN")}/${s.capacity.toLocaleString("vi-VN")}`;
  const owner = s.assignedStaffName
    ? `${s.assignedStaffName} · ${s.plantTypeCode ?? "?"}`
    : s.allowedCodes.length > 0
      ? `Chung · nhận: ${s.allowedCodes.join(", ")}`
      : "Chung · mọi mã cây";
  return `${s.code} — ${s.name} — ${owner} — ${capText}`;
}

function RndRowForm({
  row, isKhoMo, destShelves, destRooms, onDone,
}: {
  row: RndRow; isKhoMo: boolean; destShelves: DestShelf[]; destRooms: DestRoom[]; onDone: () => void;
}) {
  const [option, setOption] = useState<ComboOption | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const roomType = row.stage === "MAU_ME" ? "PHONG_MAU_ME" : "PHONG_RA_RE";
  const options: ComboOption[] = isKhoMo
    ? destShelves.filter((s) => s.roomType === roomType).map((s) => ({ value: s.code, label: destShelfLabel(s) }))
    : destRooms.map((r) => ({ value: r.code, label: `${r.code} — ${r.name}` }));

  const submit = async () => {
    if (!option) { toast.error(isKhoMo ? "Chưa chọn giàn đích" : "Chưa chọn phòng đích"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rnd-warehouse-handover/incoming/${row.transferId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toLocationCode: option.value }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã nhận ${row.totalQuantity.toLocaleString("vi-VN")} cụm từ R&D`);
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-divider bg-background p-3 space-y-3 mt-2">
      <div className="space-y-1">
        <Label className="text-sm">
          {isKhoMo ? `Giàn đích (kho mình) — ${roomType === "PHONG_MAU_ME" ? "Phòng mẫu mẹ" : "Phòng ra rễ"}` : "Phòng đích (kho mình)"}
        </Label>
        <Combobox
          items={options}
          value={option}
          isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
          onValueChange={setOption}
        >
          <ComboboxInputGroup className="w-full h-9">
            <ComboboxInput placeholder={isKhoMo ? "Gõ mã hoặc tên giàn…" : "Gõ mã hoặc tên phòng…"} />
            <ComboboxTrigger />
          </ComboboxInputGroup>
          <ComboboxContent>
            <ComboboxEmpty>Không tìm thấy</ComboboxEmpty>
            <ComboboxList>
              {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
        Xác nhận đã nhận
      </Button>
    </div>
  );
}

export default function RndWarehouseHandoverBoard({ isKhoMo }: { isKhoMo: boolean }) {
  const [rows, setRows] = useState<RndRow[]>([]);
  const [destShelves, setDestShelves] = useState<DestShelf[]>([]);
  const [destRooms, setDestRooms] = useState<DestRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rnd-warehouse-handover/incoming");
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setDestShelves(Array.isArray(data.shelves) ? data.shelves : []);
      setDestRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rowsSorted = useMemo(() => rows, [rows]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (rowsSorted.length === 0) {
    return (
      <Card><CardContent className="py-16 text-center text-text-muted">
        <FlaskConical className="w-10 h-10 mx-auto mb-3 text-text-muted" />
        <p>Không có phiếu bàn giao từ R&D nào đang chờ</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      {rowsSorted.map((row) => (
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
                  Từ <strong>Kho SX R&D</strong> — {row.fromUserName} ({row.fromUserCode})
                </p>
                {row.items.map((it, idx) => (
                  <p key={idx} className="text-sm text-text-secondary">
                    {it.plantTypeCode} — {it.plantTypeName} ({it.stageCode}) — <strong>{it.quantity.toLocaleString("vi-VN")} cụm</strong>
                  </p>
                ))}
              </div>
              {openRowId !== row.transferId && (
                <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" onClick={() => setOpenRowId(row.transferId)}>
                  <PackageCheck className="w-3.5 h-3.5 mr-1.5" /> Nhận hàng
                </Button>
              )}
            </div>
            {openRowId === row.transferId && (
              <RndRowForm row={row} isKhoMo={isKhoMo} destShelves={destShelves} destRooms={destRooms} onDone={() => { setOpenRowId(null); load(); }} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
