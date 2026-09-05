"use client";

import { useState, useMemo } from "react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ChevronDownIcon } from "lucide-react";

type PlantType = { id: string; code: string; name: string };

// Ô lọc "Mã cây" dùng chung cho các báo cáo/trang lọc dữ liệu — tích chọn NHIỀU mã cây cùng lúc thay vì
// chỉ 1 (khác Combobox 1 lựa chọn dùng cho "chọn đúng 1 bản ghi cụ thể" như tìm mã chỉ định). selectedIds
// rỗng = "Tất cả loại cây" (quy ước dùng xuyên suốt mọi bộ lọc trong hệ thống, xem instruction-plan-vs-
// actual-report.tsx — nơi component này được tách ra từ đó). Dùng DropdownMenu chỉ để làm khung popup/định
// vị; nội dung là ô tìm + danh sách nhãn/checkbox thường (không dùng DropdownMenuCheckboxItem để tránh
// phím tắt điều hướng menu can thiệp vào việc gõ tìm kiếm).
export default function PlantTypeMultiFilter({
  plantTypes, selectedIds, onChange, className, emptyLabel,
}: {
  plantTypes: PlantType[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  // Nhãn hiện khi chưa chọn gì — mặc định "Tất cả loại cây" (quy ước rỗng = tất cả). Truyền riêng cho các
  // báo cáo bắt buộc chọn ít nhất 1 mã (VD "Năng lực sản xuất" — không có khái niệm gộp mọi mã cây), tránh
  // hiểu lầm là đang xem "tất cả" trong khi thực ra chưa tải gì.
  emptyLabel?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plantTypes;
    return plantTypes.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }, [plantTypes, search]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const triggerLabel = selectedIds.length === 0 ? (emptyLabel ?? "Tất cả loại cây") : `${selectedIds.length} loại cây đã chọn`;

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
          placeholder="Gõ mã hoặc tên cây…"
          className="h-8 mb-2"
        />
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-3">Không tìm thấy mã cây</p>
          ) : (
            filtered.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent cursor-pointer">
                <Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                <span className="truncate">{p.code} — {p.name}</span>
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
