"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
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

type Option = { value: string; label: string };

// Mục đặc biệt "Chọn tất cả" — chọn mục này để xem bảng tổng hợp toàn bộ thành phẩm Phòng ra rễ theo mã
// cây + quy cách (xem box "Tổng hợp cây ra rễ tại kho sáng" ở page.tsx), thay vì lọc còn 1 mã cây.
const ALL_OPTION: Option = { value: "__ALL__", label: "— Chọn tất cả —" };

// Bộ lọc Phòng ra rễ — mã cây (gõ tự gợi ý) + khoảng tuần nhập lên kho sáng (2 ô input type="week",
// "YYYY-Www", độc lập nhau — chỉ nhập 1 trong 2 vẫn lọc được 1 phía) — lọc lại các thẻ giàn kệ + bảng
// tổng hợp theo quy cách (xem page.tsx). Lưu vào URL (?plantTypeId=, ?enteredWeekFrom=, ?enteredWeekTo=)
// để giữ được khi F5/chia sẻ link, không dùng state cục bộ.
export default function RootingPlantSearch({ plantTypeOptions }: { plantTypeOptions: Option[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPlantTypeId = searchParams.get("plantTypeId");
  const comboboxItems = [ALL_OPTION, ...plantTypeOptions];
  const selected = comboboxItems.find((o) => o.value === currentPlantTypeId) ?? null;
  const currentEnteredWeekFrom = searchParams.get("enteredWeekFrom") ?? "";
  const currentEnteredWeekTo = searchParams.get("enteredWeekTo") ?? "";

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  const hasFilter = !!currentPlantTypeId || !!currentEnteredWeekFrom || !!currentEnteredWeekTo;

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1 w-64">
        <Label className="text-xs">Tìm theo mã cây (Phòng ra rễ)</Label>
        <Combobox
          items={comboboxItems}
          value={selected}
          isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
          onValueChange={(v) => setParam("plantTypeId", (v as Option | null)?.value ?? null)}
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
          value={currentEnteredWeekFrom}
          onChange={(e) => setParam("enteredWeekFrom", e.target.value || null)}
          className="w-40 h-9"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Đến tuần nhập kho sáng</Label>
        <Input
          type="week"
          value={currentEnteredWeekTo}
          onChange={(e) => setParam("enteredWeekTo", e.target.value || null)}
          className="w-40 h-9"
        />
      </div>

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => router.push("?")}
        >
          <X className="w-3.5 h-3.5 mr-1" /> Xoá lọc
        </Button>
      )}
    </div>
  );
}
