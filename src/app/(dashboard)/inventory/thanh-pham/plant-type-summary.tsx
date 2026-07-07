"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";

type Entry = { id: string; name: string; quantity: number };

const ROWS_PER_COLUMN = 12;
const COLUMNS = 2;
const PAGE_SIZE = ROWS_PER_COLUMN * COLUMNS;

export default function PlantTypeSummary({ entries }: { entries: Entry[] }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageItems = entries.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const col1 = pageItems.slice(0, ROWS_PER_COLUMN);
  const col2 = pageItems.slice(ROWS_PER_COLUMN, PAGE_SIZE);

  const renderColumn = (col: Entry[]) => (
    <div className="space-y-2">
      {col.map((e) => (
        <div key={e.id} className="flex items-center justify-between bg-background rounded px-3 py-2">
          <span className="font-medium text-sm">{e.name}</span>
          <Badge className="bg-primary-light text-primary-strong">{e.quantity.toLocaleString("vi-VN")}</Badge>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <><ChevronUp className="w-4 h-4 mr-1" /> Thu gọn</>
        ) : (
          <><ChevronDown className="w-4 h-4 mr-1" /> Xem chi tiết</>
        )}
      </Button>

      {expanded && (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {renderColumn(col1)}
            {renderColumn(col2)}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="text-sm text-text-secondary">Trang {page + 1}/{totalPages}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Sau <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
