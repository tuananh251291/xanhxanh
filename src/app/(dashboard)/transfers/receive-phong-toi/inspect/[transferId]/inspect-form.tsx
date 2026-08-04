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

type LotRow = {
  lotId: string; lotCode: string; plantTypeCode: string; plantTypeName: string;
  stageCode: string; quantity: number; enteredAt: string; selfReportedUnqualifiedQuantity: number;
};
type Meta = { transferCode: string; staffCode: string; staffName: string; lots: LotRow[] };
// contaminatedQuantity = SL nhiễm; unqualifiedQuantity = A (Kho mô tự kiểm tra) — độc lập với B
// (LotRow.selfReportedUnqualifiedQuantity, NV cấy mô tự khai lúc bàn giao).
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
      for (const l of data.lots as LotRow[]) {
        initial[l.lotId] = { contaminatedQuantity: 0, randomCheckPassRate: 100, unqualifiedQuantity: 0 };
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

  const setContaminated = (lotId: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(value, max));
    setInputs((prev) => ({ ...prev, [lotId]: { ...prev[lotId], contaminatedQuantity: clamped } }));
  };
  const setRate = (lotId: string, value: number) => {
    const clamped = Math.max(0, Math.min(value, 100));
    setInputs((prev) => ({ ...prev, [lotId]: { ...prev[lotId], randomCheckPassRate: clamped } }));
  };
  const setUnqualified = (lotId: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(value, max));
    setInputs((prev) => ({ ...prev, [lotId]: { ...prev[lotId], unqualifiedQuantity: clamped } }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const items = meta.lots.map((l) => ({
        lotId: l.lotId,
        contaminatedQuantity: inputs[l.lotId]?.contaminatedQuantity ?? 0,
        randomCheckPassRate: inputs[l.lotId]?.randomCheckPassRate ?? 100,
        unqualifiedQuantity: l.stageCode === "M05" ? 0 : (inputs[l.lotId]?.unqualifiedQuantity ?? 0),
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

      {/* Mỗi HÀNG = 1 lô (mã cây + quy cách riêng) — nhập độc lập cho từng lô. Kết quả kiểm tra chỉ LƯU
          được gộp theo quy cách (TransferInspectionItem unique theo [inspectionId, stageCode]) nên khi
          xác nhận, các lô cùng quy cách sẽ được gộp lại (cộng dồn số lượng, trung bình tỉ lệ) — xem
          route.ts. SL ghi nhận = (SL bàn giao - max(A, B)) x tỉ lệ đạt kiểm tra ngẫu nhiên, trong đó
          A = Kho mô tự kiểm tra (nhập ở đây), B = NV cấy mô tự khai lúc bàn giao (chỉ đọc). */}
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
                  <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL bàn giao</th>
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">SL nhiễm</th>
                  <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL thực tế sau kiểm tra</th>
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">Tỉ lệ đạt kiểm tra ngẫu nhiên (%)</th>
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">SL không đạt NV kho kiểm tra</th>
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">SL không đạt NVCM nhập</th>
                  <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL NV cấy mô được ghi nhận</th>
                </tr>
              </thead>
              <tbody>
                {meta.lots.map((l) => {
                  const unit = l.stageCode.startsWith("M") ? "cụm" : "cây";
                  const isM05 = l.stageCode === "M05";
                  const contaminated = inputs[l.lotId]?.contaminatedQuantity ?? 0;
                  const rate = inputs[l.lotId]?.randomCheckPassRate ?? 100;
                  const a = isM05 ? 0 : (inputs[l.lotId]?.unqualifiedQuantity ?? 0);
                  const b = l.selfReportedUnqualifiedQuantity;
                  const credited = Math.max(0, Math.round((l.quantity - Math.max(a, b)) * (rate / 100)));
                  return (
                    <tr key={l.lotId} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-text-secondary">{l.plantTypeCode}</td>
                      <td className="px-4 py-3 text-foreground">{l.plantTypeName}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs">{l.stageCode}</span></td>
                      <td className="px-4 py-3 text-text-secondary">{format(new Date(l.enteredAt), "dd/MM/yyyy", { locale: vi })}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{l.quantity.toLocaleString("vi-VN")} {unit}</td>
                      <td className="px-4 py-3 text-center">
                        <Input
                          type="number"
                          min={0}
                          max={l.quantity}
                          className="w-24 h-8 mx-auto text-center"
                          value={contaminated}
                          onChange={(e) => setContaminated(l.lotId, parseInt(e.target.value, 10) || 0, l.quantity)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-primary-strong">
                        {(l.quantity - contaminated).toLocaleString("vi-VN")} {unit}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          className="w-24 h-8 mx-auto text-center"
                          value={rate}
                          onChange={(e) => setRate(l.lotId, parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isM05 ? (
                          <span className="text-text-muted text-xs">— (mẫu mẹ luôn đạt)</span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={l.quantity}
                            className="w-24 h-8 mx-auto text-center"
                            value={a}
                            onChange={(e) => setUnqualified(l.lotId, parseInt(e.target.value, 10) || 0, l.quantity)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-text-secondary">
                        {isM05 ? "—" : `${b.toLocaleString("vi-VN")} ${unit}`}
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
