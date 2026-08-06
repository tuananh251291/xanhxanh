"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { WORK_SESSION_LABELS } from "@/types";

type ExtraWorkRequest = {
  id: string;
  type: "EARLY_COMPLETION" | "OVERTIME";
  staff: { name: string; code: string };
  instruction: { code: string } | null;
  expectedEndDate: string | null;
  expectedEndSession: "SANG" | "CHIEU" | null;
  slots: { date: string; startTime: string; endTime: string }[];
};

function requestLabel(r: ExtraWorkRequest): string {
  if (r.type === "EARLY_COMPLETION") {
    const session = r.expectedEndSession ? WORK_SESSION_LABELS[r.expectedEndSession].toLowerCase() : "";
    const date = r.expectedEndDate ? format(new Date(r.expectedEndDate), "dd/MM", { locale: vi }) : "";
    return `${r.staff.name} — Hoàn thành sớm ${r.instruction?.code ?? ""} (dự kiến ${session} ${date})`;
  }
  const firstSlot = r.slots[0];
  const slotLabel = firstSlot
    ? `${format(new Date(firstSlot.date), "dd/MM", { locale: vi })} ${firstSlot.startTime}-${firstSlot.endTime}${r.slots.length > 1 ? ` +${r.slots.length - 1} ngày` : ""}`
    : "";
  return `${r.staff.name} — Làm thêm ngoài giờ (${slotLabel})`;
}

// Mirror AssignBackupStaffCell (chỉ định cấy dự phòng) — thay vì chọn tự do mọi NV cấy mô đang hoạt
// động, chỉ cho chọn trong số NV đang có đăng ký làm thêm/hoàn thành sớm ĐÃ DUYỆT và CHƯA dùng (xem GET
// /api/extra-work-requests?availableToAssign=true, PATCH /api/repack-instructions/[id] nhánh
// assignExtraWorkRequestId) — NV hoàn thành chỉ định cấy chính sớm trong tuần sẽ hiện ở đây để Kho mô
// gắn ngay vào việc xử lý đóng gói lại, không cần đợi hết tuần mới có việc mới.
export default function AssignRepackStaffCell({ instructionId }: { instructionId: string }) {
  const [requests, setRequests] = useState<ExtraWorkRequest[]>([]);
  const [requestId, setRequestId] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/extra-work-requests?availableToAssign=true");
      setRequests(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const assign = async () => {
    if (!requestId) { toast.error("Chọn nhân viên đã đăng ký trước"); return; }
    setAssigning(true);
    try {
      const res = await fetch(`/api/repack-instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignExtraWorkRequestId: requestId }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã bàn giao chỉ định xử lý cho nhân viên đã đăng ký");
      router.refresh();
    } finally { setAssigning(false); }
  };

  if (!loading && requests.length === 0) {
    return <span className="text-xs text-text-muted">Chưa có NV nào đăng ký làm thêm/hoàn thành sớm</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <Select
        items={requests.map((r) => ({ value: r.id, label: requestLabel(r) }))}
        value={requestId || null}
        onValueChange={(v) => setRequestId(v as string)}
        disabled={loading}
      >
        <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder={loading ? "Đang tải…" : "Chọn NV đã đăng ký"} /></SelectTrigger>
        <SelectContent>
          {requests.map((r) => (
            <SelectItem key={r.id} value={r.id}>{requestLabel(r)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={assigning || loading} onClick={assign}>
        {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
        Bàn giao
      </Button>
    </div>
  );
}
