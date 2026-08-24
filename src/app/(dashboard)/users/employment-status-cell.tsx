"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";

// Trạng thái nhân sự "Đang làm việc"/"Nghỉ việc" — dùng lại User.isActive có sẵn (đã đúng ý nghĩa "khoá
// đăng nhập ngay, KHÔNG xoá dữ liệu liên quan", xem PATCH /api/users/[id] nhánh "resign" + DELETE cùng
// route) nhưng tách hẳn khỏi dialog "Sửa tài khoản" đầy đủ (chỉ SUPER_ADMIN) để NV Hành chính nhân sự
// thao tác được qua đúng 1 nút bấm rõ nghĩa. Đánh dấu "Nghỉ việc" bắt buộc xác nhận qua dialog (hành động
// khoá đăng nhập ngay lập tức) — khôi phục lại "Đang làm việc" thì không cần, ít rủi ro hơn.
export default function EmploymentStatusCell({
  userId,
  isActive,
  canManage,
}: {
  userId: string;
  isActive: boolean;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (resign: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resign }),
      });
      if (!res.ok) {
        toast.error((await res.json()).message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success(resign ? "Đã đánh dấu nghỉ việc" : "Đã khôi phục trạng thái đang làm việc");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Badge className={isActive ? "bg-success-light text-success-foreground" : "bg-danger-light text-destructive"}>
        {isActive ? "Đang làm việc" : "Nghỉ việc"}
      </Badge>
      {canManage && isActive && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="icon-sm" variant="ghost" title="Đánh dấu nghỉ việc" />}>
            <UserX className="w-3.5 h-3.5 text-destructive" />
            <span className="sr-only">Đánh dấu nghỉ việc</span>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <UserX className="w-5 h-5" /> Xác nhận nhân sự nghỉ việc?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-text-secondary">
              Tài khoản sẽ bị <strong className="text-foreground">khoá đăng nhập ngay lập tức</strong> — mọi dữ
              liệu lịch sử liên quan (chỉ định cấy, nhật ký, đơn hàng, phiếu bàn giao...) vẫn được giữ nguyên,
              không bị xoá. Có thể khôi phục lại trạng thái &quot;Đang làm việc&quot; sau nếu cần.
            </p>
            <DialogFooter>
              <Button variant="outline" disabled={loading} onClick={() => setOpen(false)}>Huỷ</Button>
              <Button className="bg-destructive hover:bg-destructive/90 text-black" disabled={loading} onClick={() => submit(true)}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserX className="w-4 h-4 mr-2" />}
                Xác nhận nghỉ việc
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {canManage && !isActive && (
        <Button
          size="icon-sm" variant="ghost" title="Khôi phục đang làm việc" disabled={loading}
          onClick={() => submit(false)}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5 text-primary-strong" />}
          <span className="sr-only">Khôi phục đang làm việc</span>
        </Button>
      )}
    </div>
  );
}
