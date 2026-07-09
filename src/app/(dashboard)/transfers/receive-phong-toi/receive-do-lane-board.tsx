"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PackageCheck, Loader2, ClipboardCheck, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { INSPECTION_LANE_LABELS, INSPECTION_LANE_COLORS } from "@/types";

type Row = {
  transferId: string;
  code: string;
  transferredAt: string;
  staffCode: string;
  staffName: string;
  items: { lotCode: string; stageCode: string; quantity: number }[];
  totalQuantity: number;
  hasInspection: boolean;
};

export default function ReceiveDoLaneBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

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
                    <div className="flex flex-wrap gap-1">
                      {[...new Set(row.items.map((item) => item.lotCode))].map((lotCode) => (
                        <Badge key={lotCode} variant="outline" className="font-mono text-[11px]">{lotCode}</Badge>
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
                      <Link href={`/transfers/receive-phong-toi/inspect/${row.transferId}`}>
                        <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                          <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Kiểm tra
                        </Button>
                      </Link>
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
