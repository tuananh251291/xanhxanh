"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

type Column = { stageCode: string; handedOverQuantity: number; selfReportedUnqualifiedQuantity: number };
type Meta = { transferCode: string; staffCode: string; staffName: string; columns: Column[] };
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
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Chỉ số</th>
                  {meta.columns.map((col) => (
                    <th key={col.stageCode} className="text-center px-4 py-3 text-primary-strong font-bold text-base">
                      {col.stageCode} ({col.stageCode.startsWith("M") ? "cụm" : "cây"})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-4 py-3 font-medium text-foreground">Số lượng NV Cấy mô bàn giao</td>
                  {meta.columns.map((col) => (
                    <td key={col.stageCode} className="px-4 py-3 text-center font-medium text-foreground">{col.handedOverQuantity.toLocaleString("vi-VN")}</td>
                  ))}
                </tr>
                <tr className="border-b even:bg-primary-light/30">
                  <td className="px-4 py-3 font-medium text-foreground">Số lượng nhiễm không đạt</td>
                  {meta.columns.map((col) => (
                    <td key={col.stageCode} className="px-4 py-3 text-center">
                      <Input
                        type="number"
                        min={0}
                        max={col.handedOverQuantity}
                        className="w-24 h-8 mx-auto text-center"
                        value={inputs[col.stageCode]?.contaminatedQuantity ?? 0}
                        onChange={(e) => setContaminated(col.stageCode, parseInt(e.target.value, 10) || 0, col.handedOverQuantity)}
                      />
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-medium text-foreground">Số lượng thực tế ghi nhận sau kiểm tra</td>
                  {meta.columns.map((col) => {
                    const contaminated = inputs[col.stageCode]?.contaminatedQuantity ?? 0;
                    return (
                      <td key={col.stageCode} className="px-4 py-3 text-center font-medium text-primary-strong">
                        {(col.handedOverQuantity - contaminated).toLocaleString("vi-VN")}
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-b even:bg-primary-light/30">
                  <td className="px-4 py-3 font-medium text-foreground">Tỉ lệ đạt kiểm tra ngẫu nhiên (%)</td>
                  {meta.columns.map((col) => (
                    <td key={col.stageCode} className="px-4 py-3 text-center">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="w-24 h-8 mx-auto text-center"
                        value={inputs[col.stageCode]?.randomCheckPassRate ?? 100}
                        onChange={(e) => setRate(col.stageCode, parseFloat(e.target.value) || 0)}
                      />
                    </td>
                  ))}
                </tr>
                <tr className="border-b even:bg-primary-light/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Số lượng không đạt (NV tự khai, VD cây quá nhỏ)
                  </td>
                  {meta.columns.map((col) =>
                    col.stageCode === "M05" ? (
                      <td key={col.stageCode} className="px-4 py-3 text-center text-text-muted">— (mẫu mẹ luôn đạt)</td>
                    ) : (
                      <td key={col.stageCode} className="px-4 py-3 text-center">
                        <Input
                          type="number"
                          min={0}
                          max={col.handedOverQuantity}
                          className="w-24 h-8 mx-auto text-center"
                          value={inputs[col.stageCode]?.unqualifiedQuantity ?? 0}
                          onChange={(e) => setUnqualified(col.stageCode, parseInt(e.target.value, 10) || 0, col.handedOverQuantity)}
                        />
                      </td>
                    )
                  )}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-foreground">Số lượng NV cấy mô được ghi nhận</td>
                  {meta.columns.map((col) => {
                    const rate = inputs[col.stageCode]?.randomCheckPassRate ?? 100;
                    const unqualified = col.stageCode === "M05" ? 0 : (inputs[col.stageCode]?.unqualifiedQuantity ?? 0);
                    const credited = Math.max(0, Math.round((rate / 100) * col.handedOverQuantity) - unqualified);
                    return (
                      <td key={col.stageCode} className="px-4 py-3 text-center font-medium text-foreground">
                        {credited.toLocaleString("vi-VN")}
                      </td>
                    );
                  })}
                </tr>
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
