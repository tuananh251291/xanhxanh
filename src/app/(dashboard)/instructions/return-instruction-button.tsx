"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

// Chỉ hiện ở nơi đã lọc sẵn status ENDED + handedOverAt còn null (xem instructions/page.tsx, đúng chỉ
// định "quá hạn tuần thực hiện mà chưa bàn giao") — server cũng tự chặn nếu không đúng điều kiện, xem
// PATCH /api/instructions/[id] nhánh returnToStaff. Dùng Dialog tự thiết kế thay vì window.confirm(),
// cùng mẫu EndInstructionEarlyButton (daily-record) để không hiện icon cảnh báo mặc định của trình duyệt.
export default function ReturnInstructionButton({ instructionId, instructionCode }: { instructionId: string; instructionCode: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const returnToStaff = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnToStaff: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã hoàn lại chỉ định ${instructionCode} cho NV kỹ thuật`);
      setOpen(false);
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-8 border-warning-foreground text-warning-foreground hover:bg-warning-light" />}>
        <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Hoàn lại
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning-foreground">
            <Undo2 className="w-5 h-5" /> Hoàn lại chỉ định {instructionCode}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          Chỉ định này đã quá hạn tuần thực hiện mà chưa bàn giao. Hoàn lại sẽ báo cho NV kỹ thuật đã tạo
          chỉ định để họ chọn lại tuần thực hiện (tuần này hoặc tuần sau) — chỉ định sẽ{" "}
          <strong className="text-foreground">rời khỏi danh sách chờ bàn giao của bạn</strong> cho tới khi
          NV kỹ thuật bàn giao lại.
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={loading} onClick={() => setOpen(false)}>Huỷ</Button>
          <Button className="bg-warning hover:bg-warning-hover text-warning-foreground" disabled={loading} onClick={returnToStaff}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}
            Xác nhận hoàn lại
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
