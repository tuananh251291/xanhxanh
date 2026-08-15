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
// (LotRow.selfReportedUnqualifiedQuantity, NV cấy mô tự khai lúc bàn giao). Lưu dạng string (không phải
// number) để ô nhập hiện được TRỐNG thật sự thay vì luôn có sẵn 1 số (0/100) — parse ra số lúc tính toán/
// gửi lên, rỗng coi như đúng giá trị mặc định cũ (xem parseOrDefault) để công thức không đổi.
type InputState = { contaminatedQuantity: string; randomCheckPassRate: string; unqualifiedQuantity: string };

const parseOrDefault = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

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
        initial[l.lotId] = { contaminatedQuantity: "", randomCheckPassRate: "", unqualifiedQuantity: "" };
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

  // Cho phép ô trống thật sự (không ép về 0/100 ngay khi gõ) — chỉ clamp khi đã có số hợp lệ, xoá hết ký
  // tự thì giữ nguyên trạng thái trống, không tự điền lại số cũ.
  const setContaminated = (lotId: string, raw: string, max: number) => {
    if (raw.trim() === "") {
      setInputs((prev) => ({ ...prev, [lotId]: { ...prev[lotId], contaminatedQuantity: "" } }));
      return;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(0, Math.min(parsed, max));
    setInputs((prev) => ({ ...prev, [lotId]: { ...prev[lotId], contaminatedQuantity: String(clamped) } }));
  };
  const setRate = (lotId: string, raw: string) => {
    if (raw.trim() === "") {
      setInputs((prev) => ({ ...prev, [lotId]: { ...prev[lotId], randomCheckPassRate: "" } }));
      return;
    }
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(0, Math.min(parsed, 100));
    setInputs((prev) => ({ ...prev, [lotId]: { ...prev[lotId], randomCheckPassRate: String(clamped) } }));
  };
  const setUnqualified = (lotId: string, raw: string, max: number) => {
    if (raw.trim() === "") {
      setInputs((prev) => ({ ...prev, [lotId]: { ...prev[lotId], unqualifiedQuantity: "" } }));
      return;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(0, Math.min(parsed, max));
    setInputs((prev) => ({ ...prev, [lotId]: { ...prev[lotId], unqualifiedQuantity: String(clamped) } }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const items = meta.lots.map((l) => {
        const state = inputs[l.lotId];
        return {
          lotId: l.lotId,
          contaminatedQuantity: parseOrDefault(state?.contaminatedQuantity, 0),
          randomCheckPassRate: parseOrDefault(state?.randomCheckPassRate, 0),
          unqualifiedQuantity: l.stageCode === "M05" ? 0 : parseOrDefault(state?.unqualifiedQuantity, 0),
        };
      });
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
          route.ts. SL ghi nhận = (SL bàn giao - max(A, B)) x (100% - Tỉ lệ nhiễm). A = Kho mô tự kiểm tra
          (nhập ở đây), B = NV cấy mô tự khai lúc bàn giao (chỉ đọc). Cả 3 ô nhập (SL nhiễm, Tỉ lệ nhiễm,
          SL không đạt A) mặc định TRỐNG (không hiện sẵn số) — trống lúc gửi coi như đúng giá trị mặc định
          "không phát hiện gì" (0/0/0, xem parseOrDefault), chỉ khác ở chỗ không hiện số trên màn hình. */}
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
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">Tỉ lệ nhiễm (%)</th>
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">SL không đạt NV kho kiểm tra</th>
                  <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">SL không đạt NVCM nhập</th>
                  <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL NV cấy mô được ghi nhận</th>
                </tr>
              </thead>
              <tbody>
                {meta.lots.map((l) => {
                  const unit = l.stageCode.startsWith("M") ? "cụm" : "cây";
                  const isM05 = l.stageCode === "M05";
                  const contaminatedRaw = inputs[l.lotId]?.contaminatedQuantity ?? "";
                  const rateRaw = inputs[l.lotId]?.randomCheckPassRate ?? "";
                  const unqualifiedRaw = inputs[l.lotId]?.unqualifiedQuantity ?? "";
                  const contaminated = parseOrDefault(contaminatedRaw, 0);
                  const rate = parseOrDefault(rateRaw, 0);
                  const a = isM05 ? 0 : parseOrDefault(unqualifiedRaw, 0);
                  const b = l.selfReportedUnqualifiedQuantity;
                  const credited = Math.max(0, Math.round((l.quantity - Math.max(a, b)) * ((100 - rate) / 100)));
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
                          value={contaminatedRaw}
                          onChange={(e) => setContaminated(l.lotId, e.target.value, l.quantity)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-primary-strong">
                        {(l.quantity - contaminated).toLocaleString("vi-VN")} {unit}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="relative w-24 mx-auto">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            className="w-24 h-8 text-center pr-5"
                            value={rateRaw}
                            onChange={(e) => setRate(l.lotId, e.target.value)}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-muted">%</span>
                        </div>
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
                            value={unqualifiedRaw}
                            onChange={(e) => setUnqualified(l.lotId, e.target.value, l.quantity)}
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
