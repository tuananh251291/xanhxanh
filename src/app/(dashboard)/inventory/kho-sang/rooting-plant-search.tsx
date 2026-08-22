"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
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

type Option = { value: string; label: string };

// Mục đặc biệt "Chọn tất cả" — chọn mục này để xem bảng tổng hợp toàn bộ thành phẩm Phòng ra rễ theo mã
// cây + quy cách (xem box "Tổng hợp cây ra rễ tại kho sáng" ở page.tsx), thay vì lọc còn 1 mã cây.
const ALL_OPTION: Option = { value: "__ALL__", label: "— Chọn tất cả —" };

// Mục "gộp mọi cơ sở" của ô chọn kho sản xuất — chỉ hiện khi warehouseOptions được truyền vào (Quản lý
// kho thành phẩm xem Phòng ra rễ mọi cơ sở, xem page.tsx). Để trống (giá trị này) = giữ nguyên hành vi cũ
// gộp toàn bộ kho lại xem dạng thẻ; chọn đúng 1 kho mới chuyển sang xem dạng bảng như NV kho mô.
const ALL_WAREHOUSE_VALUE = "__ALL_WAREHOUSE__";

// Bộ lọc Phòng ra rễ — mã cây (gõ tự gợi ý) + khoảng tuần nhập lên kho sáng (2 ô input type="week",
// "YYYY-Www", độc lập nhau — chỉ nhập 1 trong 2 vẫn lọc được 1 phía) + kho sản xuất (chỉ Quản lý kho
// thành phẩm mới thấy, warehouseOptions truyền từ page.tsx). Dạng box giống "Tổng hợp theo loại cây" ở
// trên — chỉ ĐỔI Ô NHẬP tại chỗ, KHÔNG lọc lại dữ liệu ngay (khác bản cũ tự lọc mỗi lần đổi ô nào đó),
// phải bấm "Xem dữ liệu" mới thật sự đẩy lên URL (?plantTypeId=, ?enteredWeekFrom=, ?enteredWeekTo=,
// ?warehouseId=) để page.tsx (server component) query lại — tránh query lại kho hàng chục nghìn lô mỗi
// lần gõ dở.
export default function RootingPlantSearch({
  plantTypeOptions, warehouseOptions,
}: {
  plantTypeOptions: Option[];
  warehouseOptions?: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const comboboxItems = [ALL_OPTION, ...plantTypeOptions];

  const urlPlantTypeId = searchParams.get("plantTypeId");
  const urlWeekFrom = searchParams.get("enteredWeekFrom") ?? "";
  const urlWeekTo = searchParams.get("enteredWeekTo") ?? "";
  const urlWarehouseId = searchParams.get("warehouseId") ?? "";

  const [pendingPlantType, setPendingPlantType] = useState<Option | null>(
    () => comboboxItems.find((o) => o.value === urlPlantTypeId) ?? null
  );
  const [pendingWeekFrom, setPendingWeekFrom] = useState(urlWeekFrom);
  const [pendingWeekTo, setPendingWeekTo] = useState(urlWeekTo);
  const [pendingWarehouseId, setPendingWarehouseId] = useState(urlWarehouseId || ALL_WAREHOUSE_VALUE);

  const applyFilter = () => {
    const params = new URLSearchParams();
    if (pendingPlantType) params.set("plantTypeId", pendingPlantType.value);
    if (pendingWeekFrom) params.set("enteredWeekFrom", pendingWeekFrom);
    if (pendingWeekTo) params.set("enteredWeekTo", pendingWeekTo);
    if (warehouseOptions && pendingWarehouseId !== ALL_WAREHOUSE_VALUE) params.set("warehouseId", pendingWarehouseId);
    router.push(`?${params.toString()}`);
  };

  const clearFilter = () => {
    setPendingPlantType(null);
    setPendingWeekFrom("");
    setPendingWeekTo("");
    setPendingWarehouseId(ALL_WAREHOUSE_VALUE);
    router.push("?");
  };

  const hasAppliedFilter = !!urlPlantTypeId || !!urlWeekFrom || !!urlWeekTo || !!urlWarehouseId;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tìm theo mã cây (Phòng ra rễ)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 flex-wrap">
          {warehouseOptions && (
            <div className="space-y-1 w-64">
              <Label className="text-xs">Kho sản xuất</Label>
              <Select value={pendingWarehouseId} onValueChange={(v) => setPendingWarehouseId(v ?? ALL_WAREHOUSE_VALUE)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_WAREHOUSE_VALUE}>— Tất cả cơ sở (gộp) —</SelectItem>
                  {warehouseOptions.map((w) => (
                    <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1 w-64">
            <Label className="text-xs">Mã cây</Label>
            <Combobox
              items={comboboxItems}
              value={pendingPlantType}
              isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
              onValueChange={(v) => setPendingPlantType(v as Option | null)}
            >
              <ComboboxInputGroup className="h-9">
                <ComboboxInput placeholder="Gõ mã hoặc tên cây…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy mã cây</ComboboxEmpty>
                <ComboboxList>
                  {(item: Option) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Từ tuần nhập kho sáng</Label>
            <Input
              type="week"
              value={pendingWeekFrom}
              onChange={(e) => setPendingWeekFrom(e.target.value)}
              className="w-40 h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Đến tuần nhập kho sáng</Label>
            <Input
              type="week"
              value={pendingWeekTo}
              onChange={(e) => setPendingWeekTo(e.target.value)}
              className="w-40 h-9"
            />
          </div>

          <Button type="button" size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={applyFilter}>
            <Search className="w-3.5 h-3.5 mr-1.5" /> Xem dữ liệu
          </Button>
          {hasAppliedFilter && (
            <Button type="button" variant="ghost" size="sm" className="h-9" onClick={clearFilter}>
              <X className="w-3.5 h-3.5 mr-1.5" /> Xoá lọc
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
