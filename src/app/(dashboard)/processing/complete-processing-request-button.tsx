"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CompleteProcessingRequestButton({
  requestId,
  code,
  sourceStageCode,
  neededQuantity,
  deductQuantity,
  surplusQuantity,
}: {
  requestId: string;
  code: string;
  sourceStageCode: string;
  neededQuantity: number;
  deductQuantity: number;
  surplusQuantity: number;
}) {
  const [open, setOpen] = useState(false);
  const [actualDeduct, setActualDeduct] = useState(String(deductQuantity));
  const [actualOutput, setActualOutput] = useState(String(neededQuantity));
  const [actualSurplus, setActualSurplus] = useState(String(surplusQuantity));
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const complete = async () => {
    const actualDeductQuantity = Number(actualDeduct) || 0;
    const actualOutputQuantity = Number(actualOutput) || 0;
    const actualSurplusQuantity = Number(actualSurplus) || 0;
    if (actualOutputQuantity + actualSurplusQuantity > actualDeductQuantity) {
      toast.error("Số lượng thu được cộng số lượng dư không được lớn hơn số lượng thực tế đã lấy");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/order-processing-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", actualDeductQuantity, actualOutputQuantity, actualSurplusQuantity }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(
        actualOutputQuantity < neededQuantity
          ? "Đã hoàn thành — thiếu hụt so với yêu cầu, đã báo cho Sale"
          : "Đã hoàn thành xử lý"
      );
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" />}>
        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Hoàn thành
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-mono">{code} — nhập số liệu thật</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Số cây đã lấy từ túi {sourceStageCode} (kế hoạch {deductQuantity.toLocaleString("vi-VN")})</Label>
            <Input type="number" min={0} className="h-9" value={actualDeduct} onChange={(e) => setActualDeduct(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Số cây thực tế thu được cho đơn (cần {neededQuantity.toLocaleString("vi-VN")})</Label>
            <Input type="number" min={0} className="h-9" value={actualOutput} onChange={(e) => setActualOutput(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Số cây dư, giữ nguyên quy cách {sourceStageCode} (kế hoạch {surplusQuantity.toLocaleString("vi-VN")})</Label>
            <Input type="number" min={0} className="h-9" value={actualSurplus} onChange={(e) => setActualSurplus(e.target.value)} />
          </div>
          <p className="text-xs text-text-secondary">
            Nếu số thu được thấp hơn số cần, hệ thống sẽ tự báo cảnh báo thiếu hụt cho Sale phụ trách đơn — không tự ý xử lý thêm.
          </p>
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={complete}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Xác nhận hoàn thành
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
