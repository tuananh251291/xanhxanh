"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageCheck, Loader2, Clock } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { TRANSFER_STATUS_LABELS } from "@/types";

type Group = {
  stageCode: string;
  handedOverQuantity: number;
  unqualifiedQuantity: number;
  recordedQuantity: number | null;
  lots: { lotCode: string; plantTypeCode: string; plantTypeName: string; quantity: number }[];
};

type TransferRow = {
  id: string;
  code: string;
  status: keyof typeof TRANSFER_STATUS_LABELS;
  createdAt: string;
  inspected: boolean;
  groups: Group[];
};

const STATUS_COLORS: Record<TransferRow["status"], string> = {
  PENDING: "bg-warning-light text-warning-foreground",
  CONFIRMED: "bg-success-light text-success-foreground",
  REJECTED: "bg-danger-light text-destructive",
};

function TransferCard({ transfer, isXanh }: { transfer: TransferRow; isXanh: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5" /> Phiếu <span className="font-mono">{transfer.code}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_COLORS[transfer.status]}>{TRANSFER_STATUS_LABELS[transfer.status]}</Badge>
            <span className="text-xs text-text-muted">
              {format(new Date(transfer.createdAt), "HH:mm dd/MM/yyyy", { locale: vi })}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Mã cây</th>
                <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Tên cây chi tiết</th>
                <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Quy cách</th>
                <th className="text-right px-4 py-2 text-primary-strong font-bold text-base">Số lượng</th>
              </tr>
            </thead>
            <tbody>
              {transfer.groups.map((g) => (
                <Fragment key={g.stageCode}>
                  {g.lots.map((lot, idx) => (
                    <tr key={`${g.stageCode}-${idx}`} className="border-b last:border-0 even:bg-primary-light">
                      <td className="px-4 py-2 font-mono">{lot.plantTypeCode}</td>
                      <td className="px-4 py-2">{lot.plantTypeName}</td>
                      <td className="px-4 py-2">{g.stageCode}</td>
                      <td className="px-4 py-2 text-right font-medium">{lot.quantity.toLocaleString("vi-VN")}</td>
                    </tr>
                  ))}
                  <tr key={`${g.stageCode}-recorded`} className="border-b last:border-0 bg-muted/40">
                    <td colSpan={3} className="px-4 py-2 text-right text-text-secondary text-xs">
                      ↳ Số lượng được ghi nhận {g.lots.length > 1 ? `(quy cách ${g.stageCode})` : ""}
                      {g.unqualifiedQuantity > 0 && ` — trong đó ${g.unqualifiedQuantity.toLocaleString("vi-VN")} không đạt`}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {g.recordedQuantity === null ? (
                        <span className="inline-flex items-center gap-1 text-warning-foreground text-xs">
                          <Clock className="w-3.5 h-3.5" /> Đang chờ kiểm tra
                        </span>
                      ) : (
                        <span className={g.recordedQuantity < g.handedOverQuantity ? "text-destructive" : "text-primary-strong"}>
                          {g.recordedQuantity.toLocaleString("vi-VN")}
                        </span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!isXanh && !transfer.inspected && (
          <p className="text-xs text-warning-foreground mt-3">
            Phiếu này thuộc luồng kiểm tra (luồng Đỏ) — số lượng ghi nhận sẽ có sau khi Kho mô kiểm tra xong.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function HandoverRecordBoard() {
  const [lane, setLane] = useState<"XANH" | "DO" | null>(null);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transfers/my-handovers");
      if (res.ok) {
        const data = await res.json();
        setLane(data.lane);
        setTransfers(Array.isArray(data.transfers) ? data.transfers : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isXanh = lane === "XANH";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-primary-strong" /> Ghi nhận bàn giao
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Đối chiếu số lượng đã bàn giao với số lượng được ghi nhận cho từng phiếu —{" "}
          {isXanh
            ? "bạn thuộc luồng Xanh, số ghi nhận theo đúng số bạn tự khai lúc bàn giao (đã trừ không đạt nếu có)"
            : "bạn thuộc luồng Đỏ, số ghi nhận theo kết quả Kho mô kiểm tra"}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : transfers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có phiếu bàn giao nào</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {transfers.map((t) => (
            <TransferCard key={t.id} transfer={t} isXanh={isXanh} />
          ))}
        </div>
      )}
    </div>
  );
}
