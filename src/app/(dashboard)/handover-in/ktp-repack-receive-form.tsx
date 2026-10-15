"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

export default function KtpRepackReceiveForm({ id, code, shelves }: { id: string; code: string; shelves: { id: string; label: string }[] }) {
  const router = useRouter();
  const [shelfId, setShelfId] = useState<string | null>(shelves.length === 1 ? shelves[0].id : null);
  const [submitting, setSubmitting] = useState(false);

  const receive = async () => {
    if (!shelfId) { toast.error("Chọn giàn Phòng đợi xử lý"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/repack-instructions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ khoMoReceive: { shelfId } }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã nhận ${code} vào Phòng đợi xử lý — vào Chỉ định cấy xử lý để gán NV cấy mô`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Giàn Phòng đợi xử lý</Label>
        <Select items={shelves.map((s) => ({ value: s.id, label: s.label }))} value={shelfId} onValueChange={(v) => setShelfId(v as string)}>
          <SelectTrigger className="w-64 h-8 font-mono"><SelectValue placeholder="Chọn giàn" /></SelectTrigger>
          <SelectContent>
            {shelves.map((s) => <SelectItem key={s.id} value={s.id} className="font-mono">{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={submitting || shelves.length === 0} onClick={receive}>
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
        Nhận bàn giao
      </Button>
    </div>
  );
}
