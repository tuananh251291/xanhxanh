"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

// Dùng chung cho "Chỉ định của tôi" (Giao diện nâng cao) và "Bàn giao MM dư" (Giao diện cơ bản). Mỗi chỉ định
// chỉ bàn giao MM dư được 1 lần, không hoàn tác — bắt buộc hiện lại số lượng và hỏi NV đã đếm lại chưa trước
// khi gửi (trước đây bấm là gửi luôn, khác mọi thao tác ghi dữ liệu khác của NV cấy mô).
export default function SurplusHandoverButton({
  instructionId, instructionCode, surplus,
}: {
  instructionId: string;
  instructionCode: string;
  surplus: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const qty = surplus.toLocaleString("vi-VN");

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}/surplus-handover`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã bàn giao ${qty} mẫu mẹ dư cho Kho mô`);
      setOpen(false);
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="bg-warning text-warning-foreground hover:bg-warning-hover" />}>
        <Send className="w-3.5 h-3.5 mr-1.5" />
        Bàn giao MM dư ({qty})
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning-foreground">
            <TriangleAlert className="w-5 h-5 shrink-0" /> Xác nhận bàn giao MM dư
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-background border border-divider p-3 text-sm space-y-1">
          <p className="text-text-secondary">Chỉ định <span className="font-mono font-medium text-foreground">{instructionCode}</span></p>
          <p className="text-text-secondary">
            Số mẫu mẹ dư bàn giao cho Kho mô: <span className="text-xl font-bold text-foreground">{qty}</span> cụm
          </p>
        </div>
        <div className="rounded-lg bg-warning-light p-3 text-sm font-medium text-warning-foreground">
          Bạn đã chắc chắn chưa? Hãy đếm và kiểm tra lại số mẫu mẹ thực tế một lần nữa trước khi xác nhận —
          mỗi chỉ định chỉ bàn giao MM dư được 1 lần, đã gửi là KHÔNG sửa lại được.
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={loading} onClick={() => setOpen(false)}>Kiểm tra lại</Button>
          <Button className="bg-primary hover:bg-primary-hover" disabled={loading} onClick={submit}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Chắc chắn, bàn giao
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
