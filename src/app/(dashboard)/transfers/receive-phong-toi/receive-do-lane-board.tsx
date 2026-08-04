"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PackageCheck, Loader2, ClipboardCheck, ArrowRight, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { INSPECTION_LANE_LABELS, INSPECTION_LANE_COLORS } from "@/types";

type Row = {
  transferId: string;
  code: string;
  transferredAt: string;
  staffCode: string;
  staffName: string;
  items: { lotCode: string; stageCode: string; quantity: number; enteredAt: string }[];
  totalQuantity: number;
  hasInspection: boolean;
};

export default function ReceiveDoLaneBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transfers/receive-phong-toi/do-lane");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const revert = async (row: Row) => {
    if (!window.confirm(`Hoàn lại phiếu ${row.code} của ${row.staffName}? NV sẽ cần bàn giao lại từ đầu.`)) return;
    setReverting(row.transferId);
    try {
      const res = await fetch("/api/transfers/receive-phong-toi/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferIds: [row.transferId] }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã hoàn lại phiếu ${row.code}`);
      loadData();
    } finally {
      setReverting(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (rows.length === 0) {
    return (
      <Card><CardContent className="py-16 text-center text-text-muted">
        <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
        <p>Không có phiếu nào đang đợi trả về kho sáng</p>
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã phiếu</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên nhân viên</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Luồng</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã lô sản phẩm</th>
                <th className="text-left px-4 py-3 font-bold text-base">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.transferId} className="border-b last:border-0 even:bg-primary-light/30">
                  <td className="px-4 py-3 font-mono text-text-secondary">
                    {row.code}
                    <div className="text-xs text-text-muted font-sans">{format(new Date(row.transferredAt), "dd/MM/yyyy HH:mm", { locale: vi })}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-text-secondary">{row.staffCode}</td>
                  <td className="px-4 py-3 text-foreground">{row.staffName}</td>
                  <td className="px-4 py-3">
                    <Badge className={INSPECTION_LANE_COLORS.DO}>{INSPECTION_LANE_LABELS.DO}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.values(
                        row.items.reduce<Record<string, { lotCode: string; enteredAt: string }>>((acc, item) => {
                          const key = `${item.lotCode}__${item.enteredAt.slice(0, 10)}`;
                          acc[key] ??= { lotCode: item.lotCode, enteredAt: item.enteredAt };
                          return acc;
                        }, {})
                      ).map(({ lotCode, enteredAt }, idx) => (
                        <div key={`${lotCode}-${idx}`} className="text-center">
                          <Badge variant="outline" className="font-mono text-[11px]">{lotCode}</Badge>
                          <div className="text-[10px] text-text-muted mt-0.5">{format(new Date(enteredAt), "dd/MM/yyyy", { locale: vi })}</div>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.hasInspection ? (
                      <Link href={`/transfers/receive-phong-toi/place/${row.transferId}`}>
                        <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                          <ArrowRight className="w-3.5 h-3.5 mr-1.5" /> Tiếp tục sắp xếp về kho
                        </Button>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Link href={`/transfers/receive-phong-toi/inspect/${row.transferId}`}>
                          <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                            <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Kiểm tra
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8"
                          disabled={reverting === row.transferId}
                          onClick={() => revert(row)}
                        >
                          {reverting === row.transferId ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5 mr-1.5" />}
                          Hoàn lại
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
