"use client";

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

// Ô lọc NV gõ-để-gợi-ý dùng chung cho các báo cáo tỉ lệ nhiễm (mother-contamination-report.tsx,
// dark-room-contamination-report.tsx) — thay cho <Select> chọn thẳng trong danh sách dài, khó tìm theo
// tên. `options` truyền vào ĐÃ gồm sẵn lựa chọn "Toàn hệ thống" (hoặc tương đương) làm phần tử đầu.
export default function StaffCombobox({
  options, value, onChange, className,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const selected = options.find((o) => o.value === value) ?? options[0] ?? null;

  return (
    <Combobox
      items={options}
      value={selected}
      isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
      onValueChange={(v) => onChange((v as Option | null)?.value ?? options[0]?.value ?? "")}
    >
      <ComboboxInputGroup className={className ?? "h-9 w-56"}>
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
  );
}
