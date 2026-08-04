"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Column = { stageCode: string; handedOverQuantity: number; selfReportedUnqualifiedQuantity: number };
type LotRow = { lotId: string; lotCode: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number; enteredAt: string };
type Meta = {
  transferCode: string; staffCode: string; staffName: string;
  lots: LotRow[];
  columns: Column[];
};
type InputState = { contaminatedQuantity: number; randomCheckPassRate: number; unqualifiedQuantity: number };

export default function InspectForm({ transferId }: { transferId: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, InputState>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/transfers/receive-phong-toi/inspect/${transferId}`);
      const data = await res.json();
      if (!res.ok) { setLoadError(data.message ?? "Có lỗi xảy ra"); return; }
      setMeta(data);
      const initial: Record<string, InputState> = {};
      for (const col of data.columns as Column[]) {
        // Hiện sẵn số NV cấy mô tự khai lúc bàn giao — Kho mô xem lại, sửa nếu cần rồi mới xác nhận.
        initial[col.stageCode] = { contaminatedQuantity: 0, randomCheckPassRate: 100, unqualifiedQuantity: col.selfReportedUnqualifiedQuantity };
      }
      setInputs(initial);
    } finally {
      setLoading(false);
    }
  }, [transferId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (loadError || !meta) {
    return (
      <Card><CardContent className="py-12 text-center text-destructive">{loadError ?? "Không tìm thấy phiếu"}</CardContent></Card>
    );
  }

  const setContaminated = (stageCode: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(value, max));
    setInputs((prev) => ({ ...prev, [stageCode]: { ...prev[stageCode], contaminatedQuantity: clamped } }));
  };
  const setRate = (stageCode: string, value: number) => {
    const clamped = Math.max(0, Math.min(value, 100));
    setInputs((prev) => ({ ...prev, [stageCode]: { ...prev[stageCode], randomCheckPassRate: clamped } }));
  };
  const setUnqualified = (stageCode: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(value, max));
    setInputs((prev) => ({ ...prev, [stageCode]: { ...prev[stageCode], unqualifiedQuantity: clamped } }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const items = meta.columns.map((col) => ({
        stageCode: col.stageCode,
        contaminatedQuantity: inputs[col.stageCode]?.contaminatedQuantity ?? 0,
        randomCheckPassRate: inputs[col.stageCode]?.randomCheckPassRate ?? 100,
        unqualifiedQuantity: col.stageCode === "M05" ? 0 : (inputs[col.stageCode]?.unqualifiedQuantity ?? 0),
      }));
      const res = await fetch(`/api/transfers/receive-phong-toi/inspect/${transferId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận kiểm tra xong");
      router.push(`/transfers/receive-phong-toi/place/${transferId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <p><span className="text-text-muted">Mã phiếu:</span> <span className="font-mono font-medium text-foreground">{meta.transferCode}</span></p>
          <p><span className="text-text-muted">NV bàn giao:</span> <span className="font-medium text-foreground">{meta.staffCode} — {meta.staffName}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Quy cách</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Ngày nhập kho tối</th>
                  <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng bàn giao</th>
                </tr>
              </thead>
              <tbody>
                {meta.lots.map((l) => (
                  <tr key={l.lotId} className="border-b last:border-0 even:bg-primary-light/30">
                    <td className="px-4 py-3 font-mono text-text-secondary">{l.plantTypeCode}</td>
                    <td className="px-4 py-3 text-foreground">{l.plantTypeName}</td>
                    <td className="px-4 py-3"><span className="font-mono text-xs">{l.stageCode}</span></td>
                    <td className="px-4 py-3 text-text-secondary">{format(new Date(l.enteredAt), "dd/MM/yyyy", { locale: vi })}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {l.quantity.toLocaleString("vi-VN")} {l.stageCode.startsWith("M") ? "cụm" : "cây"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Kết quả kiểm tra (nhiễm/tỉ lệ đạt/không đạt) chỉ lưu được theo QUY CÁCH, không theo từng lô ở
          bảng trên — xem comment ở GET /api/transfers/receive-phong-toi/inspect/[transferId]. Mỗi HÀNG
          ở đây là 1 quy cách (kèm mã cây góp vào quy cách đó, thường chỉ 1 mã) — không phải 1 lô riêng,
          vì input bên dưới dùng CHUNG cho mọi lô cùng quy cách nếu phiếu gộp nhiều mã cây cùng quy cách. */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Quy cách</th>
                  <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL bàn giao</th>
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">SL nhiễm không đạt</th>
                  <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL thực tế sau kiểm tra</th>
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">Tỉ lệ đạt kiểm tra ngẫu nhiên (%)</th>
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">SL không đạt (NV tự khai)</th>
                  <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL NV cấy mô được ghi nhận</th>
                </tr>
              </thead>
              <tbody>
                {meta.columns.map((col) => {
                  const unit = col.stageCode.startsWith("M") ? "cụm" : "cây";
                  const plantCodes = [...new Set(meta.lots.filter((l) => l.stageCode === col.stageCode).map((l) => l.plantTypeCode))].join(", ");
                  const contaminated = inputs[col.stageCode]?.contaminatedQuantity ?? 0;
                  const rate = inputs[col.stageCode]?.randomCheckPassRate ?? 100;
                  const unqualified = col.stageCode === "M05" ? 0 : (inputs[col.stageCode]?.unqualifiedQuantity ?? 0);
                  const credited = Math.max(0, Math.round((rate / 100) * col.handedOverQuantity) - unqualified);
                  return (
                    <tr key={col.stageCode} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-text-secondary">{plantCodes}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs">{col.stageCode}</span></td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{col.handedOverQuantity.toLocaleString("vi-VN")} {unit}</td>
                      <td className="px-4 py-3 text-center">
                        <Input
                          type="number"
                          min={0}
                          max={col.handedOverQuantity}
                          className="w-24 h-8 mx-auto text-center"
                          value={contaminated}
                          onChange={(e) => setContaminated(col.stageCode, parseInt(e.target.value, 10) || 0, col.handedOverQuantity)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-primary-strong">
                        {(col.handedOverQuantity - contaminated).toLocaleString("vi-VN")} {unit}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          className="w-24 h-8 mx-auto text-center"
                          value={rate}
                          onChange={(e) => setRate(col.stageCode, parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {col.stageCode === "M05" ? (
                          <span className="text-text-muted text-xs">— (mẫu mẹ luôn đạt)</span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={col.handedOverQuantity}
                            className="w-24 h-8 mx-auto text-center"
                            value={unqualified}
                            onChange={(e) => setUnqualified(col.stageCode, parseInt(e.target.value, 10) || 0, col.handedOverQuantity)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{credited.toLocaleString("vi-VN")} {unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          className="bg-primary hover:bg-primary-hover"
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          Xác nhận kiểm tra xong
        </Button>
      </div>
    </div>
  );
}
