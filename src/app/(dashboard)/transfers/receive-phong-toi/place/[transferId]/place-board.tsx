"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PackageCheck, Loader2, Check, AlertTriangle, ArrowLeft, Wand2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type PlacementRow = {
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  quantity: number;
  shelfCode: string;
  pool: "OWNED" | "SHARED" | "RA_RE" | "MANUAL";
};

type Row = {
  transferCode: string;
  rootingPlacements: PlacementRow[];
  motherPlacements: PlacementRow[];
  hasPendingRooting: boolean;
  hasPendingMotherStock: boolean;
  rootingError: string | null;
  motherError: string | null;
  motherPendingQuantity: number;
};

type Placement = { lotCode: string; shelfCode: string; quantity: number; pool: string };
type ManualRow = { shelfCode: string; quantity: string };

const POOL_LABELS: Record<string, string> = { SHARED: "Dư", MANUAL: "Tự nhập" };

function StageRows({
  placements, error, buttonLabel, disabled, processing, onConfirm, borderTop, secondaryButton,
}: {
  placements: PlacementRow[];
  error: string | null;
  buttonLabel: string;
  disabled: boolean;
  processing: boolean;
  onConfirm: () => void;
  borderTop?: boolean;
  secondaryButton?: { label: string; onClick: () => void; disabled: boolean };
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
              <td className="px-4 py-3 text-right font-medium">
                {p.quantity.toLocaleString("vi-VN")} {p.stageCode.startsWith("M") ? "cụm" : "cây"}
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary">{p.shelfCode}</Badge>
                {POOL_LABELS[p.pool] && <Badge className="bg-warning-light text-warning-foreground ml-1">{POOL_LABELS[p.pool]}</Badge>}
              </td>
            </>
          ) : (
            <td className="px-4 py-3" colSpan={5}>
              <span className="text-destructive text-xs flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}</span>
            </td>
          )}
          {idx === 0 && (
            <td className="px-4 py-3 align-top" rowSpan={rows.length}>
              <div className="flex flex-col gap-1.5 items-start">
                <Button
                  size="sm"
                  className="h-8 bg-primary hover:bg-primary-hover"
                  disabled={disabled}
                  onClick={onConfirm}
                >
                  {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                  {buttonLabel}
                </Button>
                {secondaryButton && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={secondaryButton.disabled}
                    onClick={secondaryButton.onClick}
                  >
                    <Wand2 className="w-3.5 h-3.5 mr-1.5" /> {secondaryButton.label}
                  </Button>
                )}
              </div>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function ManualPlacementForm({
  totalRequired, processing, onSubmit, onCancel,
}: {
  totalRequired: number;
  processing: boolean;
  onSubmit: (rows: { shelfCode: string; quantity: number }[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<ManualRow[]>([{ shelfCode: "", quantity: "" }]);

  const setRow = (idx: number, field: keyof ManualRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, { shelfCode: "", quantity: "" }]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const allShelfCodesFilled = rows.every((r) => r.shelfCode.trim().length > 0);
  const canSubmit = total === totalRequired && allShelfCodesFilled && rows.length > 0 && !processing;

  const submit = () => {
    onSubmit(rows.map((r) => ({ shelfCode: r.shelfCode.trim().toUpperCase(), quantity: Number(r.quantity) || 0 })));
  };

  return (
    <div className="p-4 bg-warning-light/40 border-t-2 border-t-warning space-y-3">
      <p className="text-sm font-medium text-warning-foreground">
        Tự nhập kệ mẫu mẹ (không theo nguyên tắc) — dùng cho trường hợp phát sinh, cần nhập đủ đúng tổng số cụm đang chờ.
      </p>
      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              placeholder="Mã kệ, VD: SX-A-PM-A01C01"
              value={r.shelfCode}
              onChange={(e) => setRow(idx, "shelfCode", e.target.value)}
              className="w-64"
            />
            <Input
              type="number"
              min={0}
              placeholder="Số cụm"
              value={r.quantity}
              onChange={(e) => setRow(idx, "quantity", e.target.value)}
              className="w-32"
            />
            <span className="text-xs text-text-secondary">cụm</span>
            {rows.length > 1 && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeRow(idx)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={addRow} className="h-8">
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm kệ
      </Button>
      <p className={`text-sm font-medium ${total === totalRequired ? "text-primary-strong" : "text-destructive"}`}>
        Đã nhập: {total.toLocaleString("vi-VN")} / Cần xếp: {totalRequired.toLocaleString("vi-VN")} cụm
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={!canSubmit} onClick={submit}>
          {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
          Xác nhận sắp xếp thủ công
        </Button>
        <Button size="sm" variant="ghost" className="h-8" disabled={processing} onClick={onCancel}>
          Huỷ, quay lại theo nguyên tắc
        </Button>
      </div>
    </div>
  );
}

export default function PlaceBoard({ transferId }: { transferId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

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

  const showToast = (stage: "THANH_PHAM" | "MAU_ME", placements: Placement[]) => {
    const lines = placements.map((p) =>
      `${p.lotCode} → ${p.shelfCode} (${p.quantity.toLocaleString("vi-VN")}${p.pool === "SHARED" ? ", dư sang Kho chung" : ""})`
    );
    toast.success(stage === "THANH_PHAM" ? "Đã xếp kệ cây ra rễ" : "Đã xếp kệ mẫu mẹ", { description: lines.join(" · ") });
  };

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
      showToast(stage, json.placements ?? []);
      loadData();
    } finally {
      setProcessing(null);
    }
  };

  const confirmManual = async (manualRows: { shelfCode: string; quantity: number }[]) => {
    setProcessing("MAU_ME");
    try {
      const res = await fetch(`/api/transfers/receive-phong-toi/place/${transferId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "MAU_ME", manualPlacements: manualRows }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      showToast("MAU_ME", json.placements ?? []);
      setManualMode(false);
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
                  buttonLabel="Xác nhận sắp xếp theo nguyên tắc"
                  disabled={processing === "MAU_ME" || !!row.motherError}
                  processing={processing === "MAU_ME" && !manualMode}
                  onConfirm={() => confirmStage("MAU_ME")}
                  borderTop={row.hasPendingRooting}
                  secondaryButton={{
                    label: manualMode ? "Đang tự nhập kệ..." : "Không theo nguyên tắc — tự nhập kệ",
                    onClick: () => setManualMode((v) => !v),
                    disabled: processing === "MAU_ME" && !manualMode,
                  }}
                />
              )}
            </tbody>
          </table>
        </div>
        {row.hasPendingMotherStock && manualMode && (
          <ManualPlacementForm
            totalRequired={row.motherPendingQuantity}
            processing={processing === "MAU_ME"}
            onSubmit={confirmManual}
            onCancel={() => setManualMode(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}
