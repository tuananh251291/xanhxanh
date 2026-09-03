"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import PlantTypeMultiFilter from "@/components/shared/plant-type-multi-filter";

type PlantType = { id: string; code: string; name: string };

// Bộ lọc Phòng ra rễ — mã cây (tích chọn nhiều, xem PlantTypeMultiFilter) + khoảng tuần nhập lên kho sáng
// (2 ô input type="week", "YYYY-Www", độc lập nhau — chỉ nhập 1 trong 2 vẫn lọc được 1 phía). KHÔNG lọc
// lại dữ liệu ngay, phải bấm "Xem dữ liệu" mới thật sự đẩy lên URL (?plantTypeIds=, ?enteredWeekFrom=,
// ?enteredWeekTo=) để page.tsx (server component) query lại — tránh query lại kho hàng chục nghìn lô mỗi
// lần tích/bỏ tích 1 ô. selectedIds rỗng = "Tất cả mã cây" (thay cho sentinel "__ALL__" cũ của Combobox 1
// lựa chọn — page.tsx coi 0 mã và 2+ mã đều cần bảng tổng hợp CHI TIẾT theo mã cây + quy cách, chỉ đúng 1
// mã mới dùng bảng gộp đơn giản theo quy cách, xem finishedByPlantStageRows/showPlantBreakdown ở đó). Ô
// "Kho sản xuất" (WarehouseSelect, đặt riêng ở page.tsx) áp dụng NGAY khi chọn (khác box này) — chỉ đọc
// lại ?warehouseId= hiện có để GIỮ NGUYÊN khi bấm "Xem dữ liệu"/"Xoá lọc" ở đây, không tự ý xoá lựa chọn
// kho đang xem.
export default function RootingPlantSearch({ plantTypes }: { plantTypes: PlantType[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlPlantTypeIds = Array.from(
    new Set((searchParams.get("plantTypeIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean))
  );
  const urlWeekFrom = searchParams.get("enteredWeekFrom") ?? "";
  const urlWeekTo = searchParams.get("enteredWeekTo") ?? "";

  const [pendingPlantTypeIds, setPendingPlantTypeIds] = useState<string[]>(urlPlantTypeIds);
  const [pendingWeekFrom, setPendingWeekFrom] = useState(urlWeekFrom);
  const [pendingWeekTo, setPendingWeekTo] = useState(urlWeekTo);

  const applyFilter = () => {
    const params = new URLSearchParams();
    const urlWarehouseId = searchParams.get("warehouseId");
    if (urlWarehouseId) params.set("warehouseId", urlWarehouseId);
    if (pendingPlantTypeIds.length > 0) params.set("plantTypeIds", pendingPlantTypeIds.join(","));
    if (pendingWeekFrom) params.set("enteredWeekFrom", pendingWeekFrom);
    if (pendingWeekTo) params.set("enteredWeekTo", pendingWeekTo);
    router.push(`?${params.toString()}`);
  };

  const clearFilter = () => {
    setPendingPlantTypeIds([]);
    setPendingWeekFrom("");
    setPendingWeekTo("");
    const urlWarehouseId = searchParams.get("warehouseId");
    router.push(urlWarehouseId ? `?warehouseId=${urlWarehouseId}` : "?");
  };

  const hasAppliedFilter = urlPlantTypeIds.length > 0 || !!urlWeekFrom || !!urlWeekTo;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tìm theo mã cây (Phòng ra rễ)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Mã cây</Label>
            <PlantTypeMultiFilter plantTypes={plantTypes} selectedIds={pendingPlantTypeIds} onChange={setPendingPlantTypeIds} />
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
