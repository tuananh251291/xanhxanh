"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardCheck, PackageCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

type PlanItem = { itemId: string; plantTypeLabel: string; stageCode: string; estimatedQuantity: number };

export default function ConfirmPlanDialog({
  receiptId,
  code,
  supplierName,
  items,
  autoOpen,
}: {
  receiptId: string;
  code: string;
  supplierName: string;
  items: PlanItem[];
  // Tự mở dialog khi vào trang qua link ?confirmId=<id> (VD từ "Công việc hôm nay của tôi" ở dashboard).
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const [values, setValues] = useState<Record<string, { delivered: string; rejected: string }>>(() =>
    Object.fromEntries(items.map((i) => [i.itemId, { delivered: String(i.estimatedQuantity), rejected: "0" }]))
  );
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

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
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" />}>
        <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Xác nhận số liệu thật
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle className="font-mono">{code} — {supplierName}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
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
          <div className="flex gap-2 pt-2">
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={confirm}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PackageCheck className="w-4 h-4 mr-2" />}
              Nhập kho
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
