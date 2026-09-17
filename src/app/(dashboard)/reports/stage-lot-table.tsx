"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";

const PAGE_SIZE = 15;

export type StageLotRow = {
  code: string;
  quantity: number;
  expectedMoveAt: Date | null;
  plantTypeName: string;
  location: string;
};

// Bảng lô sắp/quá hạn có phân trang — dùng chung cho cả 2 bảng Mẫu mẹ/Thành phẩm ở
// "Lô sắp/quá hạn chuyển giai đoạn" (xem inventory-lifecycle-report.tsx). Nhận NGUYÊN danh sách đầy đủ
// (không cắt sẵn 15 dòng như trước) rồi tự phân trang ở client — Server Component cha đã gộp sẵn
// locationLabel thành chuỗi "location" vì không truyền được hàm qua ranh giới Server/Client Component.
export default function StageLotTable({ lots }: { lots: StageLotRow[] }) {
  const [page, setPage] = useState(0);
  if (lots.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">Không có lô nào sắp/quá hạn</p>;
  }
  const pageCount = Math.ceil(lots.length / PAGE_SIZE);
  const currentPage = Math.min(page, pageCount - 1);
  const pageLots = lots.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light">
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã lô</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Loại cây</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Khu vực</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Số lượng</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {pageLots.map((lot) => {
            const daysLeft = lot.expectedMoveAt ? differenceInCalendarDays(lot.expectedMoveAt, new Date()) : null;
            const overdue = daysLeft !== null && daysLeft < 0;
            return (
              <tr key={lot.code} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                <td className="px-3 py-2 font-mono">{lot.code}</td>
                <td className="px-3 py-2">{lot.plantTypeName}</td>
                <td className="px-3 py-2 text-text-secondary">{lot.location}</td>
                <td className="px-3 py-2 text-right tabular-nums">{lot.quantity.toLocaleString("vi-VN")}</td>
                <td className="px-3 py-2 text-right">
                  <Badge className={overdue ? "bg-danger-light text-destructive" : "bg-warning-light text-warning-foreground"}>
                    {overdue ? `Quá hạn ${Math.abs(daysLeft!)} ngày` : `Còn ${daysLeft} ngày`}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          <Button
            type="button" variant="outline" size="icon-sm"
            disabled={currentPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <p className="text-xs text-text-muted">
            Trang {currentPage + 1}/{pageCount} — tổng {lots.length.toLocaleString("vi-VN")} lô
          </p>
          <Button
            type="button" variant="outline" size="icon-sm"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
