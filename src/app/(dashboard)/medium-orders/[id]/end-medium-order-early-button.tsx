"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, OctagonX } from "lucide-react";
import { toast } from "sonner";

// Dành cho NV môi trường không bàn giao hết 8 ngày của đơn (VD nghỉ đột xuất, hoặc tuần đó không cần pha
// tiếp) — thay vì để đơn treo "Đang thực hiện" vĩnh viễn (không có tiến trình nền tự đóng như
// ensureInstructionsEnded) và chặn cứng không xác nhận được đơn tuần kế tiếp. Xem PATCH
// /api/medium-orders/[id] nhánh endEarly. Cùng mẫu Dialog với EndInstructionEarlyButton (daily-record).
export default function EndMediumOrderEarlyButton({
  orderId, orderCode, onEnded,
}: {
  orderId: string;
  orderCode: string;
  onEnded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const endEarly = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/medium-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "endEarly" }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã kết thúc sớm đơn ${orderCode}`);
      setOpen(false);
      onEnded();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-8 border-destructive text-destructive hover:bg-danger-light" />}>
        <OctagonX className="w-3.5 h-3.5 mr-1.5" /> Kết thúc đơn sớm
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <OctagonX className="w-5 h-5" /> Kết thúc đơn {orderCode}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          Chỉ bấm khi bạn <strong className="text-foreground">sẽ không bàn giao thêm ngày nào nữa</strong> của
          đơn này (VD nghỉ đột xuất, hoặc tuần đó không cần pha tiếp). Sau khi kết thúc, bạn xác nhận được
          đơn của tuần kế tiếp. Hãy kiểm tra kĩ trước khi xác nhận.
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={loading} onClick={() => setOpen(false)}>Huỷ</Button>
          <Button className="bg-destructive hover:bg-destructive/90 text-black" disabled={loading} onClick={endEarly}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <OctagonX className="w-4 h-4 mr-2" />}
            Xác nhận kết thúc sớm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
