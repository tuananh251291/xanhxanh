"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Check, PackageCheck } from "lucide-react";
import { toast } from "sonner";

type RepackForReview = {
  id: string;
  code: string;
  reportedPassedQuantity: number | null;
  reportedFailedQuantity: number | null;
  khoMoInspectedAt: string | null;
  confirmedPassedQuantity: number | null;
  confirmedFailedQuantity: number | null;
  sourceShelf: { code: string };
};

export default function RepackReviewPanel({ instruction }: { instruction: RepackForReview }) {
  const router = useRouter();
  const [passed, setPassed] = useState(String(instruction.reportedPassedQuantity ?? 0));
  const [failed, setFailed] = useState(String(instruction.reportedFailedQuantity ?? 0));
  const [shelfCode, setShelfCode] = useState(instruction.sourceShelf.code);
  const [submitting, setSubmitting] = useState(false);

  const inspect = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/repack-instructions/${instruction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspect: { confirmedPassedQuantity: Number(passed) || 0, confirmedFailedQuantity: Number(failed) || 0 },
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận kiểm tra");
      router.refresh();
    } finally { setSubmitting(false); }
  };

  const place = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/repack-instructions/${instruction.id}/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shelfCode }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã sắp xếp lên kệ");
      router.refresh();
    } finally { setSubmitting(false); }
  };

  if (!instruction.khoMoInspectedAt) {
    return (
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Đạt</Label>
          <Input type="number" min={0} className="w-24 h-8" value={passed} onChange={(e) => setPassed(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Không đạt</Label>
          <Input type="number" min={0} className="w-24 h-8" value={failed} onChange={(e) => setFailed(e.target.value)} />
        </div>
        <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={inspect}>
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
          Xác nhận kiểm tra
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <p className="text-sm text-text-secondary">
        Đã kiểm tra: <b className="text-foreground">{instruction.confirmedPassedQuantity}</b> đạt /{" "}
        <b className="text-foreground">{instruction.confirmedFailedQuantity}</b> không đạt
      </p>
      <div className="space-y-1">
        <Label className="text-xs">Mã kệ đích (gợi ý về đúng kệ gốc)</Label>
        <Input className="w-40 h-8 font-mono" value={shelfCode} onChange={(e) => setShelfCode(e.target.value)} />
      </div>
      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={place}>
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
        Sắp xếp
      </Button>
    </div>
  );
}
