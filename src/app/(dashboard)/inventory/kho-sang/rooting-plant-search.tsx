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

// Bộ lọc Phòng ra rễ — mã cây (gõ tự gợi ý) + tuần nhập lên kho sáng (input type="week", "YYYY-Www")
// — lọc lại các thẻ giàn kệ + tổng thành phẩm khớp bộ lọc (xem page.tsx). Lưu vào URL (?plantTypeId=,
// ?enteredWeek=) để giữ được khi F5/chia sẻ link, không dùng state cục bộ.
export default function RootingPlantSearch({ plantTypeOptions }: { plantTypeOptions: Option[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPlantTypeId = searchParams.get("plantTypeId");
  const selected = plantTypeOptions.find((o) => o.value === currentPlantTypeId) ?? null;
  const currentEnteredWeek = searchParams.get("enteredWeek") ?? "";

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  const hasFilter = !!currentPlantTypeId || !!currentEnteredWeek;

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1 w-64">
        <Label className="text-xs">Tìm theo mã cây (Phòng ra rễ)</Label>
        <Combobox
          items={plantTypeOptions}
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
        <Label className="text-xs">Tuần nhập lên kho sáng</Label>
        <Input
          type="week"
          value={currentEnteredWeek}
          onChange={(e) => setParam("enteredWeek", e.target.value || null)}
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
