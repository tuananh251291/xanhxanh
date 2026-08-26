"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, PackageCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

type PlanItem = { itemId: string; plantTypeLabel: string; stageCode: string; estimatedQuantity: number };

export default function GoodsReceiptConfirmForm({
  receiptId,
  code,
  supplierName,
  items,
}: {
  receiptId: string;
  code: string;
  supplierName: string;
  items: PlanItem[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, { delivered: string; rejected: string }>>(() =>
    Object.fromEntries(items.map((i) => [i.itemId, { delivered: String(i.estimatedQuantity), rejected: "0" }]))
  );
  const [submitting, setSubmitting] = useState(false);

  const updateValue = (itemId: string, patch: Partial<{ delivered: string; rejected: string }>) =>
    setValues((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));

  const confirm = async () => {
    const payloadItems = items.map((i) => ({
      itemId: i.itemId,
      quantityDelivered: Number(values[i.itemId]?.delivered) || 0,
      quantityRejected: Number(values[i.itemId]?.rejected) || 0,
    }));
    for (const p of payloadItems) {
      if (p.quantityRejected > p.quantityDelivered) { toast.error("Số lượng không đạt không được lớn hơn số lượng bàn giao"); return; }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/goods-receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", items: payloadItems }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã xác nhận số liệu thật cho kế hoạch ${code}`);
      router.push("/goods-receipts");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/goods-receipts">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Xác nhận số liệu thật</h1>
          <p className="text-text-secondary text-sm">
            <span className="font-mono">{code}</span> — {supplierName}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Nhập số liệu thật cho từng dòng</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="border border-divider rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Loại cây / Quy cách</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">Số lượng theo phiếu bàn giao</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">SL bàn giao thật</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">SL không đạt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.itemId} className="border-t border-divider">
                    <td className="px-3 py-2 text-foreground">{item.plantTypeLabel} · {item.stageCode}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{item.estimatedQuantity.toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number" min={0} className="h-9 text-right"
                        value={values[item.itemId]?.delivered ?? ""}
                        onChange={(e) => updateValue(item.itemId, { delivered: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number" min={0} className="h-9 text-right"
                        value={values[item.itemId]?.rejected ?? ""}
                        onChange={(e) => updateValue(item.itemId, { rejected: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-secondary">
            Nếu số lượng bàn giao thật thấp hơn số đã có đơn giữ chỗ, hệ thống sẽ chặn xác nhận và báo rõ dòng nào bị ảnh hưởng.
          </p>
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={confirm}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PackageCheck className="w-4 h-4 mr-2" />}
            Nhập kho
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
