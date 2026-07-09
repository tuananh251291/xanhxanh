"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PackageCheck, Loader2, Check, AlertTriangle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type PlacementRow = {
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  quantity: number;
  shelfCode: string;
  pool: "OWNED" | "SHARED" | "RA_RE";
};

type Row = {
  transferCode: string;
  rootingPlacements: PlacementRow[];
  motherPlacements: PlacementRow[];
  hasPendingRooting: boolean;
  hasPendingMotherStock: boolean;
  rootingError: string | null;
  motherError: string | null;
};

type Placement = { lotCode: string; shelfCode: string; quantity: number; pool: "OWNED" | "SHARED" | "RA_RE" };

function StageRows({
  placements, error, buttonLabel, disabled, processing, onConfirm, borderTop,
}: {
  placements: PlacementRow[];
  error: string | null;
  buttonLabel: string;
  disabled: boolean;
  processing: boolean;
  onConfirm: () => void;
  borderTop?: boolean;
}) {
  const rows = placements.length > 0 ? placements : [null];
  return (
    <>
      {rows.map((p, idx) => (
        <tr key={idx} className={`border-b last:border-0 even:bg-primary-light/30 ${borderTop && idx === 0 ? "border-t-2 border-t-border" : ""}`}>
          {p ? (
            <>
              <td className="px-4 py-3 font-mono text-text-secondary">{p.plantTypeCode}</td>
              <td className="px-4 py-3 text-foreground">{p.plantTypeName}</td>
              <td className="px-4 py-3"><Badge variant="outline">{p.stageCode}</Badge></td>
              <td className="px-4 py-3 text-right font-medium">{p.quantity.toLocaleString("vi-VN")}</td>
              <td className="px-4 py-3">
                <Badge variant="secondary">{p.shelfCode}</Badge>
                {p.pool === "SHARED" && <Badge className="bg-warning-light text-warning-foreground ml-1">Dư</Badge>}
              </td>
            </>
          ) : (
            <td className="px-4 py-3" colSpan={5}>
              <span className="text-destructive text-xs flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}</span>
            </td>
          )}
          {idx === 0 && (
            <td className="px-4 py-3 align-top" rowSpan={rows.length}>
              <Button
                size="sm"
                className="h-8 bg-primary hover:bg-primary-hover"
                disabled={disabled}
                onClick={onConfirm}
              >
                {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                {buttonLabel}
              </Button>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

export default function PlaceBoard({ transferId }: { transferId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/transfers/receive-phong-toi/place/${transferId}`);
      const data = await res.json();
      if (!res.ok) { setLoadError(data.message ?? "Có lỗi xảy ra"); return; }
      setRow(data);
    } finally {
      setLoading(false);
    }
  }, [transferId]);

  useEffect(() => { loadData(); }, [loadData]);

  const confirmStage = async (stage: "THANH_PHAM" | "MAU_ME") => {
    setProcessing(stage);
    try {
      const res = await fetch(`/api/transfers/receive-phong-toi/place/${transferId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      const placements: Placement[] = json.placements ?? [];
      const lines = placements.map((p) =>
        `${p.lotCode} → ${p.shelfCode} (${p.quantity.toLocaleString("vi-VN")}${p.pool === "SHARED" ? ", dư sang Kho chung" : ""})`
      );
      toast.success(stage === "THANH_PHAM" ? "Đã xếp kệ cây ra rễ" : "Đã xếp kệ mẫu mẹ", { description: lines.join(" · ") });
      loadData();
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (loadError || !row) {
    return (
      <Card><CardContent className="py-12 text-center text-destructive">{loadError ?? "Không tìm thấy phiếu"}</CardContent></Card>
    );
  }

  if (!row.hasPendingRooting && !row.hasPendingMotherStock) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-4">
          <PackageCheck className="w-10 h-10 mx-auto text-primary-strong" />
          <p className="text-foreground font-medium">Đã hoàn tất sắp xếp về kho cho phiếu {row.transferCode}</p>
          <Link href="/transfers/receive-phong-toi">
            <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Quay lại danh sách</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Quy cách</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Kệ chỉ định</th>
                <th className="text-left px-4 py-3 font-bold text-base">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {row.hasPendingRooting && (
                <StageRows
                  placements={row.rootingPlacements}
                  error={row.rootingError}
                  buttonLabel="Xác nhận xếp cây ra rễ xong"
                  disabled={processing === "THANH_PHAM" || !!row.rootingError}
                  processing={processing === "THANH_PHAM"}
                  onConfirm={() => confirmStage("THANH_PHAM")}
                />
              )}
              {row.hasPendingMotherStock && (
                <StageRows
                  placements={row.motherPlacements}
                  error={row.motherError}
                  buttonLabel="Xác nhận xếp mẫu mẹ xong"
                  disabled={processing === "MAU_ME" || !!row.motherError}
                  processing={processing === "MAU_ME"}
                  onConfirm={() => confirmStage("MAU_ME")}
                  borderTop={row.hasPendingRooting}
                />
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
