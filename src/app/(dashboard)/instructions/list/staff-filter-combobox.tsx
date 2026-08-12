"use client";

import { useState } from "react";
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

// Gõ tên/mã NV cấy mô sẽ tự gợi ý (giống mọi combobox mã cây khác trong app, xem RootingPlantSearch) —
// khác chỗ đó là component đứng ĐỘC LẬP (tự router.push), còn ở đây phải nằm CHUNG 1 <form> GET với các
// ô lọc khác (ngày/kệ/mã cây) nên chỉ giữ lựa chọn ở local state + input ẩn "staff", submit cùng lúc khi
// bấm nút Tìm kiếm thay vì tự điều hướng ngay lúc chọn.
export default function StaffFilterCombobox({ staffOptions, defaultValue }: { staffOptions: Option[]; defaultValue: string }) {
  const [selected, setSelected] = useState<Option | null>(staffOptions.find((o) => o.value === defaultValue) ?? null);

  return (
    <>
      <input type="hidden" name="staff" value={selected?.value ?? ""} />
      <Combobox
        items={staffOptions}
        value={selected}
        isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
        onValueChange={(v) => setSelected(v as Option | null)}
      >
        <ComboboxInputGroup className="h-9 w-56">
          <ComboboxInput placeholder="Gõ tên hoặc mã NV…" />
          <ComboboxTrigger />
        </ComboboxInputGroup>
        <ComboboxContent>
          <ComboboxEmpty>Không tìm thấy NV</ComboboxEmpty>
          <ComboboxList>
            {(item: Option) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </>
  );
}
