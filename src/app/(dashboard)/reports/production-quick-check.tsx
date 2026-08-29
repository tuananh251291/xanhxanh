"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { ROOM_TYPE_LABELS } from "@/types";

type Warehouse = { id: string; code: string; name: string };
type PlantType = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };
type CheckResult = { total: number; byRoomType: Record<string, number>; byStageCode?: Record<string, number> };

const STAGE_OPTIONS = [
  { value: "M05", label: "M05 — Mẫu mẹ (túi 5 cụm)" },
  { value: "T01", label: "T01 — Thành phẩm (túi 1 cây)" },
  { value: "T05", label: "T05 — Thành phẩm (túi 5 cây)" },
  { value: "T10", label: "T10 — Thành phẩm (túi 10 cây)" },
  // Không phải 1 quy cách túi cụ thể — server cộng gộp cả 3 quy cách T01+T05+T10 lại (xem ALL_FINISHED_
  // STAGE_CODES ở route.ts).
  { value: "ALL_FINISHED", label: "Cây thành phẩm (tổng T01 + T05 + T10)" },
];

// "Kiểm tra nhanh sản lượng" — bổ sung dưới biểu đồ sản lượng ở tab Sản lượng (/reports). Gộp số lượng
// ACTIVE của đúng 1 (khu sản xuất, mã cây, quy cách) trên TOÀN khu — Phòng tối cá nhân từng NV (hàng
// chưa bàn giao) + Phòng mẫu mẹ + Phòng ra rễ (2 phòng sau gọi chung là "kho sáng") — xem GET
// /api/reports/quick-stock-check. Không tự tải lại khi đổi bộ lọc — chỉ bấm "Kiểm tra" mới gọi API, vì
// đây là công cụ tra cứu tại 1 THỜI ĐIỂM, không phải biểu đồ theo dõi liên tục.
export default function ProductionQuickCheck() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);

  const [warehouseId, setWarehouseId] = useState("");
  const [plantTypeOption, setPlantTypeOption] = useState<ComboOption | null>(null);
  const [stageCode, setStageCode] = useState("");

  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/warehouses?type=SAN_XUAT")
      .then((r) => r.json())
      .then((d) => setWarehouses(Array.isArray(d) ? d.map((w: Warehouse) => ({ id: w.id, code: w.code, name: w.name })) : []));
    fetch("/api/plant-types")
      .then((r) => r.json())
      .then((d) => setPlantTypes(Array.isArray(d) ? d : []));
  }, []);

  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);
  const plantTypeOptions = useMemo(() => plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })), [plantTypes]);

  const canCheck = !!warehouseId && !!plantTypeOption && !!stageCode;

  const check = async () => {
    if (!canCheck) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ warehouseId, plantTypeId: plantTypeOption!.value, stageCode });
      const res = await fetch(`/api/reports/quick-stock-check?${params}`);
      const json = await res.json();
      if (!res.ok) { setResult(null); return; }
      setResult(json);
      setCheckedAt(new Date());
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kiểm tra nhanh sản lượng</CardTitle>
        <p className="text-sm text-text-secondary">
          Số lượng hiện có tại thời điểm kiểm tra — cộng cả kho sáng (Phòng mẫu mẹ/Phòng ra rễ) và Phòng
          tối cá nhân của từng NV (hàng chưa bàn giao), đã trừ hàng nhiễm.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Khu sản xuất</Label>
            <Select items={warehouseOptions} value={warehouseId} onValueChange={(v) => setWarehouseId(v as string)}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Chọn khu sản xuất" /></SelectTrigger>
              <SelectContent>
                {warehouseOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Loại cây</Label>
            <Combobox
              items={plantTypeOptions}
              value={plantTypeOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={setPlantTypeOption}
            >
              <ComboboxInputGroup className="w-56 h-9">
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
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Quy cách</Label>
            <Select items={STAGE_OPTIONS} value={stageCode} onValueChange={(v) => setStageCode(v as string)}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Chọn quy cách" /></SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={!canCheck || loading} onClick={check}>
            {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />}
            Kiểm tra
          </Button>
        </div>

        {result && (
          <div className="pt-3 border-t border-divider space-y-2">
            <p className="text-sm text-text-secondary">
              Tại thời điểm {checkedAt ? checkedAt.toLocaleString("vi-VN") : ""}:
            </p>
            <p className="text-2xl font-bold text-primary-strong">
              {result.total.toLocaleString("vi-VN")} <span className="text-sm font-normal text-text-secondary">cây/cụm</span>
            </p>
            {Object.keys(result.byRoomType).length > 0 && (
              <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
                {Object.entries(result.byRoomType).map(([type, qty]) => (
                  <span key={type}>
                    {ROOM_TYPE_LABELS[type as keyof typeof ROOM_TYPE_LABELS] ?? type}: <strong className="text-foreground">{qty.toLocaleString("vi-VN")}</strong>
                  </span>
                ))}
              </div>
            )}
            {result.byStageCode && Object.keys(result.byStageCode).length > 0 && (
              <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
                {Object.entries(result.byStageCode).map(([code, qty]) => (
                  <span key={code}>
                    {code}: <strong className="text-foreground">{qty.toLocaleString("vi-VN")}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
