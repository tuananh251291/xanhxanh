"use client";

import { useRouter, useSearchParams } from "next/navigation";
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

type Option = { value: string; label: string };

// Tìm nhanh 1 mã cây trong Phòng ra rễ — gõ mã/tên sẽ tự gợi ý (giống mọi combobox mã cây khác trong
// app), chọn xong lọc lại các thẻ giàn kệ chỉ còn đúng mã cây đó (xem page.tsx). Lưu lựa chọn vào URL
// (?plantTypeId=) để giữ được khi F5/chia sẻ link, không dùng state cục bộ.
export default function RootingPlantSearch({ plantTypeOptions }: { plantTypeOptions: Option[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("plantTypeId");
  const selected = plantTypeOptions.find((o) => o.value === current) ?? null;

  const setPlantType = (v: Option | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set("plantTypeId", v.value);
    else params.delete("plantTypeId");
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-1 max-w-xs">
      <Label className="text-xs">Tìm theo mã cây (Phòng ra rễ)</Label>
      <Combobox
        items={plantTypeOptions}
        value={selected}
        isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
        onValueChange={(v) => setPlantType(v as Option | null)}
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
  );
}
