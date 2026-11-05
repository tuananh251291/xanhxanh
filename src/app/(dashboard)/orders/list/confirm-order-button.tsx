"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

// "Khách đã cọc" — thay nút Xác nhận cũ: ghi số tiền + ngày cọc, kiểm tra phiếu báo giá, sinh Yêu cầu xử lý cây và
// chuyển đơn sang Kho thành phẩm (xem confirmOrder ở PATCH /api/orders/[id]).
export default function ConfirmOrderButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const confirm = async () => {
    const depositAmount = Number(amount);
    if (!amount.trim() || !Number.isFinite(depositAmount) || depositAmount < 0) { toast.error("Nhập số tiền cọc hợp lệ"); return; }
    if (!date) { toast.error("Chọn ngày cọc"); return; }
    setConfirming(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", depositAmount, depositedAt: date }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(
        json.processingRequestCount > 0
          ? `Đã ghi nhận cọc — ${json.processingRequestCount} dòng cần tách túi, đã gửi Yêu cầu xử lý sang Kho thành phẩm`
          : "Đã ghi nhận khách đã cọc"
      );
      setOpen(false);
      router.refresh();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" onClick={() => setOpen(true)}>
        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Khách đã cọc
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Khách đã cọc</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`deposit-amount-${orderId}`}>Số tiền cọc</Label>
              <Input id={`deposit-amount-${orderId}`} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`deposit-date-${orderId}`}>Ngày cọc</Label>
              <Input id={`deposit-date-${orderId}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <p className="text-sm text-text-secondary">
              Sau khi xác nhận, đơn chuyển sang Kho thành phẩm và không còn tự huỷ theo hạn giữ.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={confirming} onClick={() => setOpen(false)}>Đóng</Button>
              <Button type="button" size="sm" disabled={confirming} onClick={confirm}>
                {confirming && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Xác nhận cọc
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
