"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

type Staff = { id: string; name: string };

export default function AssignStaffCell({ instructionId, staffList }: { instructionId: string; staffList: Staff[] }) {
  const [staffId, setStaffId] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const assign = async () => {
    if (!staffId) { toast.error("Chọn nhân viên cấy trước"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: staffId }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã phân công nhân viên cấy");
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <div className="flex items-center gap-1">
      <Select onValueChange={(v) => setStaffId(v as string)}>
        <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Chọn NV cấy" /></SelectTrigger>
        <SelectContent>
          {staffList.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" disabled={loading} onClick={assign}>
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}
