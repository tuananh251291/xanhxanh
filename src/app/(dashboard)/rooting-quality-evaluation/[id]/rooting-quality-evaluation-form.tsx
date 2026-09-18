"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ClipboardCheck, Loader2, Send, CheckCheck } from "lucide-react";
import { toast } from "sonner";

type Row = { plantTypeId: string; stageCode: string; total: number; code: string; name: string };

export default function RootingQualityEvaluationForm({
  evaluationId, code, title, rows,
}: {
  evaluationId: string;
  code: string;
  title: string;
  rows: Row[];
}) {
  const router = useRouter();
  // Mặc định = tổng tồn (coi như đạt hết) — NV Kỹ thuật sửa xuống cho dòng nào có hàng không đạt, giống
  // hệt mặc định "Đặt tất cả về tối đa" ở early-handoff-form.tsx.
  const [passed, setPassed] = useState<Record<string, number>>(
    Object.fromEntries(rows.map((r) => [`${r.plantTypeId}::${r.stageCode}`, r.total]))
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const setAllToMax = () => setPassed(Object.fromEntries(rows.map((r) => [`${r.plantTypeId}::${r.stageCode}`, r.total])));

  const setQty = (key: string, raw: string, max: number) => {
    const parsed = Math.floor(Number(raw));
    const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : 0;
    setPassed((prev) => ({ ...prev, [key]: clamped }));
  };

  const totalAll = rows.reduce((s, r) => s + r.total, 0);
  const totalPassed = rows.reduce((s, r) => s + (passed[`${r.plantTypeId}::${r.stageCode}`] ?? 0), 0);
  const totalFailed = totalAll - totalPassed;

  const submit = async () => {
    if (!reason.trim()) { toast.error("Cần nhập lý do giải thích tỉ lệ đạt/không đạt"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rooting-quality-evaluations/${evaluationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rows.map((r) => ({ plantTypeId: r.plantTypeId, stageCode: r.stageCode, passedQuantity: passed[`${r.plantTypeId}::${r.stageCode}`] ?? 0 })),
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã hoàn thành đánh giá — phần không đạt đã lùi sang tuần sau");
      router.push("/rooting-quality-evaluation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/rooting-quality-evaluation">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary-strong" /> {title}
          </h1>
          <p className="text-text-secondary text-sm mt-1"><span className="font-mono">{code}</span></p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Nhập số đạt cho từng loại cây / quy cách</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={setAllToMax}>
              <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Đặt tất cả về đạt hết
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-text-muted">Nhóm này chưa có thành phẩm nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Quy cách</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tổng tồn</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base w-32">Số đạt</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Không đạt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const key = `${r.plantTypeId}::${r.stageCode}`;
                    const p = passed[key] ?? 0;
                    return (
                      <tr key={key} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-text-secondary mr-2">{r.code}</span>
                          {r.name}
                        </td>
                        <td className="px-4 py-2.5">{r.stageCode}</td>
                        <td className="px-4 py-2.5 text-right text-text-secondary">{r.total.toLocaleString("vi-VN")}</td>
                        <td className="px-4 py-2.5">
                          <Input
                            type="number" min={0} max={r.total} value={p}
                            onChange={(e) => setQty(key, e.target.value, r.total)}
                            className="w-24 h-8 ml-auto text-right"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right text-destructive font-medium">{(r.total - p).toLocaleString("vi-VN")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-text-secondary">
              Tổng: <strong className="text-foreground">{totalAll.toLocaleString("vi-VN")}</strong>
              {" "}· Đạt: <strong className="text-success-foreground">{totalPassed.toLocaleString("vi-VN")}</strong>
              {" "}· Không đạt: <strong className="text-destructive">{totalFailed.toLocaleString("vi-VN")}</strong>
            </p>
            <div className="space-y-1">
              <Label>Giải thích nguyên nhân tỉ lệ này <span className="text-destructive">*</span></Label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: nhiễm nấm ở giai đoạn ra rễ, cây còi cọc do thiếu ánh sáng..."
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <Button className="w-full bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Gửi đánh giá
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
