"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

export default function RepackReturnReceiveForm({
  id, defaultPassed, defaultFailed, maxTotal,
}: {
  id: string;
  defaultPassed: number;
  defaultFailed: number;
  maxTotal: number;
}) {
  const router = useRouter();
  const [passed, setPassed] = useState(String(defaultPassed));
  const [failed, setFailed] = useState(String(defaultFailed));
  const [submitting, setSubmitting] = useState(false);

  const receive = async () => {
    const p = Math.max(0, parseInt(passed, 10) || 0);
    const f = Math.max(0, parseInt(failed, 10) || 0);
    if (p + f > maxTotal) { toast.error(`Tổng đạt + không đạt vượt quá ${maxTotal.toLocaleString("vi-VN")} cây đã gửi xử lý`); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/repack-instructions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ktpReceive: { passedQuantity: p, failedQuantity: f } }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã nhận lại — đạt vào Phòng đạt tiêu chuẩn, không đạt về Phòng chờ xử lý");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Đạt (vào Phòng đạt tiêu chuẩn)</Label>
        <Input type="number" min={0} className="w-28 h-8" value={passed} onChange={(e) => setPassed(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Không đạt (về Phòng chờ xử lý)</Label>
        <Input type="number" min={0} className="w-28 h-8" value={failed} onChange={(e) => setFailed(e.target.value)} />
      </div>
      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={receive}>
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
        Xác nhận nhận lại
      </Button>
    </div>
  );
}
