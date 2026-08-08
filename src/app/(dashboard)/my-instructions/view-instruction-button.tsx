"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { toast } from "sonner";

// Chặn ngay lúc bấm "Xem" (không cho điều hướng) nếu NV còn 1 chỉ định KHÁC đã bàn giao/chưa xác nhận
// cần thực hiện trước (xem điều kiện "blocked" tính ở page.tsx, cùng thứ tự ưu tiên với server ở PATCH
// /api/instructions/[id] nhánh confirmMotherReceived) — chỉ chặn xem trước, xác nhận thật sự vẫn chốt lại
// ở server phòng khi NV vào thẳng URL.
export default function ViewInstructionButton({ instructionId, blocked }: { instructionId: string; blocked: boolean }) {
  if (blocked) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => toast.error("Bạn còn chỉ định cấy cần thực hiện trước")}
      >
        <Eye className="w-4 h-4 mr-1" /> Xem
      </Button>
    );
  }

  return (
    <Link href={`/instructions/${instructionId}`}>
      <Button size="sm"><Eye className="w-4 h-4 mr-1" /> Xem</Button>
    </Link>
  );
}
