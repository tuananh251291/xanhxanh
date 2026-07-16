"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ReturnInspectionDialog({
  itemId,
  plantTypeLabel,
  quantityPassed,
}: {
  itemId: string;
  plantTypeLabel: string;
  quantityPassed: number;
}) {
  const [open, setOpen] = useState(false);
  const [returnQuantity, setReturnQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const submit = async () => {
    const qty = Number(returnQuantity) || 0;
    if (qty > quantityPassed) { toast.error("Số lượng trả hàng không được lớn hơn số lượng đạt lúc nhập"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/goods-receipt-items/${itemId}/return`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnQuantity: qty }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(qty > 0 ? `Đã trả ${qty.toLocaleString("vi-VN")} cây cho nhà cung cấp` : "Đã kiểm tra — không phát hiện thêm lỗi");
      setOpen(false); router.refresh();
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setReturnQuantity(""); }}>
      <DialogTrigger render={<Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" />}>
        <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Kiểm tra
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Kiểm tra hàng trả lại — {plantTypeLabel}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>Số lượng cây không đạt phát hiện trong thời gian vừa qua</Label>
            <Input
              type="number"
              min={0}
              max={quantityPassed}
              value={returnQuantity}
              onChange={(e) => setReturnQuantity(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-text-secondary">Tối đa {quantityPassed.toLocaleString("vi-VN")} cây (số lượng đạt lúc nhập)</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}
              Trả hàng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
