"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Loader2, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Row = {
  id: string;
  code: string;
  status: "PENDING_CLASSIFICATION" | "PENDING_APPROVAL" | "APPROVED";
  createdAt: string;
  transfer: { code: string; transferredAt: string };
  warehouse: { code: string; name: string };
  items: { rejectedQuantity: number }[];
};

const STATUS_LABEL: Record<Row["status"], string> = {
  PENDING_CLASSIFICATION: "Chưa phân loại",
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
};
const STATUS_BADGE_VARIANT: Record<Row["status"], "info" | "in-progress" | "completed"> = {
  PENDING_CLASSIFICATION: "info",
  PENDING_APPROVAL: "in-progress",
  APPROVED: "completed",
};

// Dùng chung cho cả 2 trang hub — Đối tác vận hành (/market-receive/reject-classification) và NV bán
// hàng (/reject-classification) — GET /api/reject-classifications đã tự lọc theo đúng quyền của session,
// component chỉ việc hiển thị. Cả 2 đều mở cùng 1 trang chi tiết /market-receive/reject-classification/[id].
export default function RejectClassificationListBoard({ title }: { title: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reject-classifications");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const groups: { status: Row["status"]; label: string }[] = [
    { status: "PENDING_CLASSIFICATION", label: "Chưa phân loại" },
    { status: "PENDING_APPROVAL", label: "Đang chờ duyệt" },
    { status: "APPROVED", label: "Đã duyệt" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary-strong" />
          {title}
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có đề xuất phân loại hàng không đạt nào</p>
        </CardContent></Card>
      ) : (
        groups.map((g) => {
          const groupRows = rows.filter((r) => r.status === g.status);
          if (groupRows.length === 0) return null;
          return (
            <div key={g.status} className="space-y-2">
              <h2 className="text-sm font-bold text-text-secondary">{g.label} ({groupRows.length})</h2>
              <Card>
                <CardContent className="p-0 divide-y">
                  {groupRows.map((r) => {
                    const total = r.items.reduce((sum, it) => sum + it.rejectedQuantity, 0);
                    return (
                      <Link
                        key={r.id}
                        href={`/market-receive/reject-classification/${r.id}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-primary-light/30"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-text-secondary">{r.code}</span>
                            <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                          </div>
                          <p className="text-xs text-text-muted mt-0.5">
                            Lô hàng nhập ngày {format(new Date(r.transfer.transferredAt), "dd/MM/yyyy", { locale: vi })} —{" "}
                            {r.warehouse.name} — {total.toLocaleString("vi-VN")} cây không đạt
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          );
        })
      )}
    </div>
  );
}
