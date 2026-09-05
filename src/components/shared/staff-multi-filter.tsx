"use client";

import { useState, useMemo } from "react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ChevronDownIcon } from "lucide-react";

type Staff = { id: string; code: string; name: string };

// Ô lọc "Nhân viên" dùng chung cho các báo cáo tỉ lệ nhiễm (thay StaffCombobox — Combobox 1 lựa chọn cũ,
// đã xoá) — tích chọn NHIỀU NV cùng lúc. selectedIds rỗng = "Toàn hệ thống" (quy ước rỗng = tất cả, cùng
// PlantTypeMultiFilter). Cấu trúc/hành vi y hệt PlantTypeMultiFilter — 2 component tách riêng vì khác kiểu
// dữ liệu đầu vào (name/code thay vì code/name) và khác nhãn hiển thị.
export default function StaffMultiFilter({
  staffList, selectedIds, onChange, className,
}: {
  staffList: Staff[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [staffList, search]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const triggerLabel = selectedIds.length === 0 ? "Toàn hệ thống" : `${selectedIds.length} NV đã chọn`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={className ?? "flex h-9 w-56 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm"}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDownIcon className="w-4 h-4 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-2" align="start">
        {/* onKeyDown chặn nổi bọt lên Popup — base-ui Menu tự bắt phím ký tự đơn để "gõ nhảy tới mục" (typeahead)
            và preventDefault(), nếu không chặn thì gõ chữ vào ô này sẽ không hiện ra được. */}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Gõ tên hoặc mã NV…"
          className="h-8 mb-2"
        />
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-3">Không tìm thấy NV</p>
          ) : (
            filtered.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent cursor-pointer">
                <Checkbox checked={selectedIds.includes(s.id)} onCheckedChange={() => toggle(s.id)} />
                <span className="truncate">{s.name} ({s.code})</span>
              </label>
            ))
          )}
        </div>
        {selectedIds.length > 0 && (
          <button
            type="button"
            className="mt-2 w-full text-center text-xs text-info-foreground underline underline-offset-2"
            onClick={() => onChange([])}
          >
            Bỏ chọn tất cả
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
