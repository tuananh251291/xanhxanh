"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type PlantTypeBreakdown = { plantTypeCode: string; plantTypeName: string; quantity: number };
type ShelfRow = {
  id: string;
  code: string;
  name: string;
  plantTypeName: string | null;
  assignedStaffName: string | null;
  m05Quantity: number;
  breakdown: PlantTypeBreakdown[];
};

const PAGE_SIZE = 10;

export default function MotherShelfTable({
  roomId, assigned, label, emptyLabel,
}: {
  roomId: string;
  assigned: boolean;
  label: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ShelfRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Go go 300ms sau khi ngung go moi goi API tim kiem - tranh spam request tren tap ke rat lon.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => setPage(1), [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ roomId, assigned: String(assigned), page: String(page) });
    if (debouncedQuery) params.set("q", debouncedQuery);
    fetch(`/api/shelves/mother-room?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [roomId, assigned, page, debouncedQuery]);

  const totalPages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;

  return (
    <div>
      <p className="text-xs font-semibold text-text-secondary mb-2">
        {label} <span className="font-normal text-text-muted">({total ?? "…"} kệ)</span>
      </p>

      <div className="relative mb-2 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm mã/tên kệ, mã cây, NV phụ trách..."
          className="pl-8 h-8 text-xs"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-text-muted pl-1">
          {debouncedQuery ? `Không tìm thấy kệ nào khớp "${debouncedQuery}"` : emptyLabel}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Mã kệ</th>
                  <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Tên kệ</th>
                  <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Tên cây chi tiết</th>
                  <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Nhân viên phụ trách</th>
                  <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">M05 (cụm)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((shelf) => {
                  // Kệ chung có thể đang xếp lẫn NHIỀU mã cây cùng lúc (không gán cố định như kệ đã chia)
                  // — tách mỗi mã cây thành 1 dòng riêng (rowSpan các cột theo kệ) thay vì gộp mù mờ 1
                  // dòng/kệ. Kệ trống (chưa có lô nào) rơi về đúng 1 dòng "—" như trước.
                  const rows = shelf.breakdown.length > 0 ? shelf.breakdown : [null];
                  return rows.map((b, idx) => (
                    <tr key={shelf.id + "-" + idx} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                      {idx === 0 && (
                        <>
                          <td className="px-3 py-2 text-sm font-bold text-foreground whitespace-nowrap" rowSpan={rows.length}>{shelf.code}</td>
                          <td className="px-3 py-2 text-sm text-text-secondary whitespace-nowrap" rowSpan={rows.length}>{shelf.name}</td>
                        </>
                      )}
                      <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{b ? b.plantTypeName : (shelf.plantTypeName ?? "—")}</td>
                      {idx === 0 && (
                        <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap" rowSpan={rows.length}>{shelf.assignedStaffName ?? "—"}</td>
                      )}
                      <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{(b ? b.quantity : shelf.m05Quantity).toLocaleString("vi-VN")}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-2">
              <span className="text-xs text-text-muted">Trang {page}/{totalPages}</span>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
