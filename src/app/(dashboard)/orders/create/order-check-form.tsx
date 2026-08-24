"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Trash2, Search, PackageCheck, Loader2, TriangleAlert, Download, Upload, PenLine, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { MARKET_LABELS, CUSTOMER_GROUP_LABELS, type CustomerGroup } from "@/types";

const MARKET_OPTIONS = Object.entries(MARKET_LABELS).map(([value, label]) => ({ value, label }));

type PlantType = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };
type DemandRow = { key: string; plantTypeId: string; stageCode: "T01" | "T05" | "T10"; quantity: string };
type ExcelItem = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number; notes?: string };
type ExcelRowError = { row: number; label: string; message: string };
type Alternative = {
  stageCode: string; available: number; suggestedQty: number; surplusQuantity: number; accepted: boolean;
  requiresProcessing: boolean; source: "DAT_TIEU_CHUAN" | "HAN_TUI_THEO_DOI";
  usesPlannedStock: boolean; plannedDate: string | null; bufferQuantity: number;
};

const BAG_SIZE: Record<string, number> = { T01: 1, T05: 5, T10: 10 };

// Phân bổ lại phần thiếu (remainingTotal) cho các đề xuất thay thế theo đúng thứ tự ưu tiên server đã
// trả về — bỏ tích 1 đề xuất thì phần thiếu nó đang bù tự động dồn sang đề xuất còn lại (tính lại từ
// đầu danh sách mỗi lần đổi tích, không cộng dồn state cũ để tránh sai lệch). Đề xuất ĐÚNG quy cách đang
// thiếu (tier 3a — Kho hàn túi/Theo dõi, chỉ cần chuyển phòng) không bao giờ làm tròn túi vì không phải
// mở túi, dù bagSize của quy cách đó >1 cây. Sau khi phân bổ lại, tính lại dự phòng 5% (chỉ tier 2 —
// Phòng đạt tiêu chuẩn) y hệt applyConversionBuffer ở server (xem orders/check/route.ts) vì đề xuất
// "cuối cùng" có thể đổi sau khi bỏ tích 1 đề xuất khác.
const reallocateAlternatives = (remainingTotal: number, alts: Alternative[], demandStageCode: string): Alternative[] => {
  let remaining = remainingTotal;
  const next = alts.map((a) => {
    if (!a.accepted || remaining <= 0) return { ...a, suggestedQty: 0, surplusQuantity: 0, bufferQuantity: 0 };
    const sameStage = a.stageCode === demandStageCode;
    const bagSize = sameStage ? 1 : (BAG_SIZE[a.stageCode] ?? 1);
    let suggestedQty: number;
    let surplusQuantity: number;
    if (bagSize <= 1) {
      suggestedQty = Math.min(a.available, remaining);
      surplusQuantity = 0;
    } else {
      const desiredDeduct = Math.ceil(remaining / bagSize) * bagSize;
      const actualDeduct = Math.min(a.available, desiredDeduct);
      suggestedQty = Math.min(actualDeduct, remaining);
      surplusQuantity = actualDeduct - suggestedQty;
    }
    remaining -= suggestedQty;
    return { ...a, suggestedQty, surplusQuantity, bufferQuantity: 0 };
  });

  const tier2 = next.filter((a) => a.source === "DAT_TIEU_CHUAN" && a.suggestedQty > 0);
  const totalConverted = tier2.reduce((s, a) => s + a.suggestedQty, 0);
  const processingAlts = tier2.filter((a) => a.requiresProcessing);
  if (processingAlts.length > 0) {
    const last = processingAlts[processingAlts.length - 1];
    const lastBagSize = BAG_SIZE[last.stageCode] ?? 1;
    const bufferWanted = Math.ceil((totalConverted * 0.05) / lastBagSize) * lastBagSize;
    const room = Math.max(0, last.available - last.suggestedQty - last.surplusQuantity);
    const bufferQuantity = Math.min(bufferWanted, room);
    if (bufferQuantity > 0) {
      const idx = next.indexOf(last);
      next[idx] = { ...last, surplusQuantity: last.surplusQuantity + bufferQuantity, bufferQuantity };
    }
  }
  return next;
};
type CheckResult = {
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  quantityDemand: number;
  availableAtStage: number;
  fulfilledAtStage: number;
  usesPlannedStock: boolean;
  plannedDate: string | null;
  alternatives: Alternative[];
  totalFulfilled: number;
};

const STAGE_OPTIONS = [
  { value: "T01", label: "T01 (túi 1 cây)" },
  { value: "T05", label: "T05 (túi 5 cây)" },
  { value: "T10", label: "T10 (túi 10 cây)" },
];

let rowKeySeq = 0;
const newRow = (): DemandRow => ({ key: `r${++rowKeySeq}`, plantTypeId: "", stageCode: "T01", quantity: "" });
// Mặc định 8 dòng trống để Sale nhập nhanh nhu cầu 1 lượt — vẫn bấm "Thêm dòng" được nếu cần nhiều hơn.
const DEFAULT_ROW_COUNT = 8;

const availabilityKey = (plantTypeId: string, stageCode: string) => `${plantTypeId}::${stageCode}`;

// holdDays theo TỪNG khách — với NV bán hàng là "Năng lực giữ đơn" của chính họ (giống nhau ở mọi khách);
// với Quản lý kho thành phẩm tạo hộ (xem canActAsSale) là của ĐÚNG NV bán hàng đang phụ trách khách đó
// (có thể khác nhau giữa các khách) — xem src/app/(dashboard)/orders/page.tsx.
type Customer = { id: string; code: string; name: string; customerGroup: CustomerGroup | null; holdDays: number | null };

export default function OrderCheckForm({
  plantTypes, customers,
}: { plantTypes: PlantType[]; customers: Customer[] }) {
  const [rows, setRows] = useState<DemandRow[]>(() => Array.from({ length: DEFAULT_ROW_COUNT }, newRow));
  // Nhãn "Mã sản phẩm - Tên cây" (VD "AL001 - Alocasia Red Secret") để gõ tìm theo cả mã lẫn tên.
  const plantTypeOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));
  // Nhãn "Mã KH - Tên khách" để gõ tìm theo cả mã lẫn tên — với NV Sale chỉ liệt kê khách họ đang phụ
  // trách (khớp đúng phạm vi /customer-status); với Quản lý kho thành phẩm tạo hộ (canActAsSale) là mọi
  // khách đã có NV bán hàng phụ trách, xem src/app/(dashboard)/orders/page.tsx.
  const customerOptions: ComboOption[] = customers.map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` }));
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [holding, setHolding] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const holdDays = selectedCustomer?.holdDays ?? null;
  const [market, setMarket] = useState("");
  const [expectedShipAt, setExpectedShipAt] = useState("");
  const [exportCode, setExportCode] = useState("");
  // "Nhập tay" = luồng Check/alternatives có sẵn (giữ nguyên 100%). "Tải Excel" = bỏ qua bước Check —
  // items lấy thẳng từ file, không thay thế quy cách/làm tròn túi vì số liệu Excel đã chính xác theo
  // yêu cầu khách (xem POST /api/orders/import-items).
  const [mode, setMode] = useState<"manual" | "excel">("manual");
  const [excelItems, setExcelItems] = useState<ExcelItem[]>([]);
  const [excelErrors, setExcelErrors] = useState<ExcelRowError[]>([]);
  const [excelUploading, setExcelUploading] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  // Tồn đạt tiêu chuẩn theo từng tổ hợp loại cây + quy cách — cache theo key để 2 dòng cùng tổ hợp không tra
  // lại 2 lần, tự tra ngay khi có đủ loại cây + quy cách (không cần đợi nhập số lượng/bấm "Check").
  const [availability, setAvailability] = useState<Record<string, number>>({});

  useEffect(() => {
    const keysToFetch = new Set<string>();
    for (const row of rows) {
      if (!row.plantTypeId) continue;
      const key = availabilityKey(row.plantTypeId, row.stageCode);
      if (!(key in availability)) keysToFetch.add(key);
    }
    keysToFetch.forEach((key) => {
      const [plantTypeId, stageCode] = key.split("::");
      fetch(`/api/orders/available?plantTypeId=${plantTypeId}&stageCode=${stageCode}`)
        .then((r) => r.json())
        .then((data: { available: number }) => {
          setAvailability((prev) => ({ ...prev, [key]: data.available }));
        });
    });
  }, [rows, availability]);

  const updateRow = (key: string, patch: Partial<DemandRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setResults(null);
  };
  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (key: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
    setResults(null);
  };

  const onCheck = async () => {
    if (!expectedShipAt) {
      toast.error("Cần chọn thời gian dự kiến xuất trước khi Check");
      return;
    }
    const items = rows
      .filter((r) => r.plantTypeId && Number(r.quantity) > 0)
      .map((r) => ({ plantTypeId: r.plantTypeId, stageCode: r.stageCode, quantity: Number(r.quantity) }));
    if (items.length === 0) {
      toast.error("Cần nhập ít nhất 1 dòng nhu cầu hợp lệ");
      return;
    }
    setChecking(true);
    try {
      const res = await fetch("/api/orders/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedShipAt, items }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      setResults(json.results.map((r: CheckResult) => ({ ...r, alternatives: r.alternatives.map((a) => ({ ...a, accepted: true })) })));
    } finally {
      setChecking(false);
    }
  };

  const toggleAlternative = (resultIdx: number, altIdx: number) => {
    setResults((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const result = next[resultIdx];
      const toggledAlts = result.alternatives.map((a, i) => (i === altIdx ? { ...a, accepted: !a.accepted } : a));
      const remainingTotal = result.quantityDemand - result.fulfilledAtStage;
      next[resultIdx] = { ...result, alternatives: reallocateAlternatives(remainingTotal, toggledAlts, result.stageCode) };
      return next;
    });
  };

  const acceptedTotalFor = (r: CheckResult) =>
    r.fulfilledAtStage + r.alternatives.filter((a) => a.accepted).reduce((s, a) => s + a.suggestedQty, 0);

  // Gọi chung cho cả 2 chế độ (nhập tay/Excel) — giữ nguyên contract POST /api/orders (đã tự kiểm tra
  // tồn kho real-time trong transaction Serializable), chỉ khác cách `items` được dựng.
  const submitHold = async (items: { plantTypeId: string; stageCode: string; quantity: number; neededQuantity?: number; notes?: string }[]) => {
    if (!customerId) { toast.error("Cần chọn khách hàng"); return; }
    if (!market) { toast.error("Cần chọn thị trường"); return; }
    if (!expectedShipAt) { toast.error("Cần chọn thời gian dự kiến xuất"); return; }
    if (items.length === 0) { toast.error("Không có dòng nào để giữ đơn"); return; }

    setHolding(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, market, expectedShipAt, exportCode: exportCode || undefined, items }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      const holdLabel = selectedCustomer?.customerGroup === "KHACH_CONG_TY_LON" ? "5 tháng" : `${holdDays} ngày`;
      toast.success(`Đã tạo đơn ${json.code} — giữ trong ${holdLabel}`);
      setRows(Array.from({ length: DEFAULT_ROW_COUNT }, newRow));
      setResults(null);
      setExcelItems([]);
      setExcelErrors([]);
      setCustomerId("");
      setMarket("");
      setExpectedShipAt("");
      setExportCode("");
    } finally {
      setHolding(false);
    }
  };

  const onHoldManual = () => {
    if (!results) return;
    const items: { plantTypeId: string; stageCode: string; quantity: number; neededQuantity?: number }[] = [];
    for (const r of results) {
      if (r.fulfilledAtStage > 0) items.push({ plantTypeId: r.plantTypeId, stageCode: r.stageCode, quantity: r.fulfilledAtStage });
      for (const a of r.alternatives) {
        if (!a.accepted) continue;
        if (a.suggestedQty <= 0 && a.surplusQuantity <= 0) continue;
        // Cần xử lý (mở túi lớn hơn HOẶC chuyển từ Kho hàn túi/Theo dõi): phải giữ NGUYÊN CẢ túi
        // (suggestedQty + surplusQuantity) ngay lúc tạm giữ — trừ đủ khỏi tồn đạt tiêu chuẩn chứ không
        // chỉ trừ phần thật cần (neededQuantity), nếu không phần dư (xử lý lúc Xác nhận) vẫn coi là "còn
        // tồn" và có thể bị đơn khác giữ mất.
        items.push({
          plantTypeId: r.plantTypeId,
          stageCode: a.stageCode,
          quantity: a.suggestedQty + a.surplusQuantity,
          neededQuantity: a.requiresProcessing ? a.suggestedQty : undefined,
        });
      }
    }
    submitHold(items);
  };

  // Bỏ qua bước Check/alternatives hoàn toàn — items lấy nguyên từ Excel (đã validate mã cây/quy
  // cách/số lượng ở POST /api/orders/import-items), không thay thế quy cách/làm tròn túi.
  const onHoldExcel = () => {
    submitHold(excelItems.map((i) => ({ plantTypeId: i.plantTypeId, stageCode: i.stageCode, quantity: i.quantity, notes: i.notes })));
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setExcelUploading(true);
    setExcelItems([]);
    setExcelErrors([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/orders/import-items", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      if (json.errors.length > 0) {
        setExcelErrors(json.errors);
        toast.error(`Chưa nhập được gì — file có ${json.errors.length} dòng lỗi, xem chi tiết bên dưới rồi sửa lại và tải lên lại`);
      } else {
        setExcelItems(json.items);
        toast.success(`Đã đọc ${json.items.length} dòng từ file`);
      }
    } finally {
      setExcelUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "manual" ? "default" : "outline"} className={mode === "manual" ? "bg-primary hover:bg-primary-hover" : ""} onClick={() => setMode("manual")}>
          <PenLine className="w-3.5 h-3.5 mr-1.5" /> Nhập tay
        </Button>
        <Button type="button" size="sm" variant={mode === "excel" ? "default" : "outline"} className={mode === "excel" ? "bg-primary hover:bg-primary-hover" : ""} onClick={() => setMode("excel")}>
          <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Tải Excel
        </Button>
      </div>

      {mode === "manual" && (
      <Card>
        <CardHeader><CardTitle className="text-base">Nhu cầu khách hàng</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 max-w-xs">
            <Label>Thời gian dự kiến xuất *</Label>
            <Input
              type="datetime-local"
              value={expectedShipAt}
              onChange={(e) => { setExpectedShipAt(e.target.value); setResults(null); }}
            />
            <p className="text-xs text-text-secondary">Quyết định lô hàng dự kiến (chưa về) nào được tính vào khả dụng.</p>
          </div>
          <div className="overflow-x-auto border border-divider rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Loại cây</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold w-44">Quy cách</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">Số lượng đạt tiêu chuẩn (cây)</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold w-28">Số lượng nhu cầu (cây)</th>
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
                              <ComboboxItem key={item.value} value={item} className="text-sm">
                                {item.label}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </td>
                    <td className="px-3 py-1.5">
                      <Select items={STAGE_OPTIONS} value={row.stageCode} onValueChange={(v) => updateRow(row.key, { stageCode: v as "T01" | "T05" | "T10" })}>
                        <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STAGE_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {!row.plantTypeId ? (
                        <span className="text-text-muted">—</span>
                      ) : availabilityKey(row.plantTypeId, row.stageCode) in availability ? (
                        <span className="font-medium text-foreground">
                          {availability[availabilityKey(row.plantTypeId, row.stageCode)].toLocaleString("vi-VN")}
                        </span>
                      ) : (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted ml-auto" />
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Input type="number" min={1} className="h-9" value={row.quantity} onChange={(e) => updateRow(row.key, { quantity: e.target.value })} placeholder="0 cây" />
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
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="w-4 h-4 mr-1" /> Thêm dòng
            </Button>
            <Button type="button" size="sm" className="bg-primary hover:bg-primary-hover" onClick={onCheck} disabled={checking}>
              {checking ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />}
              Check
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {mode === "excel" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Tải Excel bảng dòng hàng</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-text-secondary">
              Số liệu trong file được giữ nguyên (không thay thế quy cách/làm tròn túi như Check) — tạm
              giữ đơn thẳng luôn, hệ thống vẫn tự kiểm tra tồn kho thực tế lúc bấm &quot;Tạm giữ đơn hàng&quot;.
            </p>
            <div className="space-y-1 max-w-xs">
              <Label>Thời gian dự kiến xuất *</Label>
              <Input type="datetime-local" value={expectedShipAt} onChange={(e) => setExpectedShipAt(e.target.value)} />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Link href="/api/orders/import-items" className="flex-1">
                <Button type="button" variant="outline" className="w-full">
                  <Download className="w-4 h-4 mr-1.5" /> Tải mẫu Excel
                </Button>
              </Link>
              <input ref={excelInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleExcelUpload} disabled={excelUploading} />
              <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={excelUploading} onClick={() => excelInputRef.current?.click()}>
                {excelUploading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                Tải lên file đã điền
              </Button>
            </div>

            {excelErrors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-destructive">
                  Chưa nhập được gì — file có {excelErrors.length} dòng lỗi, sửa lại rồi tải lên lại
                </p>
                <div className="max-h-56 overflow-y-auto border border-divider rounded-lg divide-y divide-divider">
                  {excelErrors.map((err, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <span className="font-mono font-medium text-destructive">Dòng {err.row} · {err.label}</span>
                      <p className="text-text-secondary mt-0.5">{err.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {excelItems.length > 0 && (
              <div className="overflow-x-auto border border-divider rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                      <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tên cây</th>
                      <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                      <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Số lượng</th>
                      <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Yêu cầu đặc biệt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelItems.map((it, i) => (
                      <tr key={i} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="px-3 py-1.5 font-mono">{it.plantTypeCode}</td>
                        <td className="px-3 py-1.5">{it.plantTypeName}</td>
                        <td className="px-3 py-1.5">{it.stageCode}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{it.quantity.toLocaleString("vi-VN")}</td>
                        <td className="px-3 py-1.5 text-text-secondary">{it.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "manual" && results && (
        <Card>
          <CardHeader><CardTitle className="text-base">Kết quả kiểm tra đáp ứng</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {results.map((r, ri) => (
              <div key={`${r.plantTypeId}-${r.stageCode}-${ri}`} className="border border-divider rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-3 py-2 text-primary-strong font-bold">Loại cây</th>
                      <th className="text-left px-3 py-2 text-primary-strong font-bold">Quy cách</th>
                      <th className="text-right px-3 py-2 text-primary-strong font-bold">Nhu cầu (cây)</th>
                      <th className="text-right px-3 py-2 text-primary-strong font-bold">Tồn kho đạt tiêu chuẩn (cây)</th>
                      <th className="text-right px-3 py-2 text-primary-strong font-bold">Đáp ứng (cây)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-divider">
                      <td className="px-3 py-2 font-medium">
                        {r.plantTypeName} ({r.plantTypeCode})
                        {r.usesPlannedStock && (
                          <Badge className="ml-1.5 bg-info-light text-info-foreground">
                            Có hàng dự kiến{r.plannedDate ? ` về ${new Date(r.plannedDate).toLocaleDateString("vi-VN")}` : ""}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.stageCode}</td>
                      <td className="px-3 py-2 text-right">{r.quantityDemand.toLocaleString("vi-VN")}</td>
                      <td className="px-3 py-2 text-right">{r.availableAtStage.toLocaleString("vi-VN")}</td>
                      <td className="px-3 py-2 text-right font-semibold">{r.fulfilledAtStage.toLocaleString("vi-VN")}</td>
                    </tr>
                    {r.alternatives.map((a, ai) => {
                      const sameStage = a.stageCode === r.stageCode;
                      const label = a.source === "HAN_TUI_THEO_DOI"
                        ? sameStage
                          ? `Đang ở Kho hàn túi/Theo dõi — cùng quy cách ${a.stageCode}`
                          : `Đề xuất thay thế — Kho hàn túi/Theo dõi, quy cách ${a.stageCode}`
                        : `Đề xuất thay thế — Quy cách ${a.stageCode}`;
                      return (
                        <Fragment key={`${a.source}-${a.stageCode}`}>
                          <tr className="bg-background">
                            <td className="px-3 py-1.5 pl-6 text-text-secondary text-xs" colSpan={2}>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <Checkbox checked={a.accepted} onCheckedChange={() => toggleAlternative(ri, ai)} />
                                {label}
                                {a.usesPlannedStock && (
                                  <Badge className="bg-info-light text-info-foreground">
                                    Có hàng dự kiến{a.plannedDate ? ` về ${new Date(a.plannedDate).toLocaleDateString("vi-VN")}` : ""}
                                  </Badge>
                                )}
                              </label>
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs">—</td>
                            <td className="px-3 py-1.5 text-right text-xs">{a.available.toLocaleString("vi-VN")}</td>
                            <td className="px-3 py-1.5 text-right text-xs font-semibold">{a.suggestedQty.toLocaleString("vi-VN")}</td>
                          </tr>
                          {a.source === "HAN_TUI_THEO_DOI" && (
                            <tr className="bg-background">
                              <td className="px-3 pb-1.5 pl-10 text-warning-foreground text-xs italic" colSpan={4}>
                                *Cần Kho thành phẩm xử lý (chuyển từ Kho hàn túi/Theo dõi) trước khi xuất kho
                              </td>
                            </tr>
                          )}
                          {a.stageCode === "T01" && (
                            <tr className="bg-background">
                              <td className="px-3 pb-1.5 pl-10 text-warning-foreground text-xs italic" colSpan={4}>
                                *Lưu ý có phụ phí cho việc lấy túi 1
                              </td>
                            </tr>
                          )}
                          {a.surplusQuantity - a.bufferQuantity > 0 && (
                            <tr className="bg-background">
                              <td className="px-3 pb-1.5 pl-10 text-text-secondary text-xs" colSpan={3}>
                                ↳ Số dư tròn túi, chuyển sang quy cách T01
                              </td>
                              <td className="px-3 pb-1.5 text-right text-xs font-semibold text-text-secondary">
                                {(a.surplusQuantity - a.bufferQuantity).toLocaleString("vi-VN")}
                              </td>
                            </tr>
                          )}
                          {a.bufferQuantity > 0 && (
                            <tr className="bg-background">
                              <td className="px-3 pb-1.5 pl-10 text-text-secondary text-xs" colSpan={3}>
                                ↳ Dự phòng hao hụt 5% khi tách túi (giữ thêm, hoàn trả nếu không dùng hết)
                              </td>
                              <td className="px-3 pb-1.5 text-right text-xs font-semibold text-text-secondary">
                                {a.bufferQuantity.toLocaleString("vi-VN")}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-3 py-2 bg-card border-t border-divider flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Tổng đáp ứng</span>
                  <Badge className={acceptedTotalFor(r) >= r.quantityDemand ? "bg-success-light text-success-foreground" : "bg-warning-light text-warning-foreground"}>
                    {acceptedTotalFor(r).toLocaleString("vi-VN")} / {r.quantityDemand.toLocaleString("vi-VN")}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(mode === "manual" ? !!results : excelItems.length > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Thông tin khách hàng</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {customerId && !holdDays && (
              <div className="flex items-center gap-2 text-sm font-medium text-destructive bg-danger-light rounded-lg p-3">
                <TriangleAlert className="w-4 h-4 shrink-0" />
                Chưa xác định được &quot;Năng lực giữ đơn&quot; cho khách này — liên hệ Admin trước khi tạm giữ đơn hàng.
              </div>
            )}
            {holdDays && (
              <p className="text-xs text-text-secondary">
                {selectedCustomer?.customerGroup === "KHACH_CONG_TY_LON"
                  ? "Khách công ty lớn — đơn sẽ được giữ trong 5 tháng kể từ lúc tạo."
                  : `Đơn sẽ được giữ trong ${holdDays} ngày kể từ lúc tạo.`}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Khách hàng *</Label>
                <Combobox
                  items={customerOptions}
                  value={customerOptions.find((o) => o.value === customerId) ?? null}
                  isItemEqualToValue={(a, b) => a.value === b.value}
                  onValueChange={(v) => setCustomerId(v?.value ?? "")}
                >
                  <ComboboxInputGroup>
                    <ComboboxInput placeholder="Gõ mã hoặc tên khách hàng…" />
                    <ComboboxTrigger />
                  </ComboboxInputGroup>
                  <ComboboxContent>
                    <ComboboxEmpty>Không tìm thấy khách hàng bạn phụ trách</ComboboxEmpty>
                    <ComboboxList>
                      {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                {selectedCustomer?.customerGroup && (
                  <p className="text-xs text-text-muted">{CUSTOMER_GROUP_LABELS[selectedCustomer.customerGroup]}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Thị trường *</Label>
                <Select items={MARKET_OPTIONS} value={market} onValueChange={(v) => setMarket(v as string)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Chọn thị trường" /></SelectTrigger>
                  <SelectContent>
                    {MARKET_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Thời gian dự kiến xuất</Label>
                <p className="text-sm text-foreground px-3 py-2 bg-muted rounded-md">
                  {new Date(expectedShipAt).toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Mã đơn xuất khẩu</Label>
                <Input value={exportCode} onChange={(e) => setExportCode(e.target.value)} placeholder="Tuỳ chọn — hiện trên phiếu in" />
              </div>
            </div>
            <Button className="w-full bg-primary hover:bg-primary-hover" disabled={holding || !holdDays} onClick={mode === "manual" ? onHoldManual : onHoldExcel}>
              {holding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PackageCheck className="w-4 h-4 mr-2" />}
              Tạm giữ đơn hàng
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
