"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, OctagonX } from "lucide-react";
import { toast } from "sonner";

// Dành cho NV cấy mô nghỉ đột xuất giữa tuần, không làm nốt các ngày còn lại của chỉ định (VD hết Thứ 7
// mà không đi làm Chủ nhật thì bấm) — thay vì để chỉ định treo "Đang thực hiện" tới tận khi hệ thống tự
// đóng lúc sang tuần mới (xem ensureInstructionsEnded). Xem PATCH /api/instructions/[id] nhánh endEarly.
//
// Dùng Dialog tự thiết kế thay vì window.confirm() (trước đây) — window.confirm() hiện icon cảnh báo
// mặc định của trình duyệt (không kiểm soát được, không khớp giao diện app) khiến NV tưởng nhầm là lỗi.
export default function EndInstructionEarlyButton({
  instructionId, instructionCode, onEnded,
}: {
  instructionId: string;
  instructionCode: string;
  onEnded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const endEarly = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endEarly: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã kết thúc sớm chỉ định ${instructionCode}`);
      setOpen(false);
      onEnded();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="w-full bg-destructive hover:bg-destructive/90 text-black" />}>
        <OctagonX className="w-4 h-4 mr-2" /> Kết thúc chỉ định sớm
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <OctagonX className="w-5 h-5" /> Kết thúc chỉ định cấy {instructionCode}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          Chỉ bấm khi bạn <strong className="text-foreground">chưa cấy hết số lượng</strong> của chỉ định cấy
          và <strong className="text-foreground">sẽ nghỉ hết tuần này</strong>. Hãy kiểm tra kĩ trước khi xác nhận.
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
