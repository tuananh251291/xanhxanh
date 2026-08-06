"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  sourceShelf: { code: string; warehouseId: string };
};

type LotWithShelf = { shelf: { code: string } | null };
type ShelfOption = { code: string; label: string };

export default function RepackReviewPanel({ instruction }: { instruction: RepackForReview }) {
  const router = useRouter();
  const [passed, setPassed] = useState(String(instruction.reportedPassedQuantity ?? 0));
  const [failed, setFailed] = useState(String(instruction.reportedFailedQuantity ?? 0));
  const [shelfCode, setShelfCode] = useState(instruction.sourceShelf.code);
  const [shelfOptions, setShelfOptions] = useState<ShelfOption[]>([]);
  const [loadingShelves, setLoadingShelves] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Chỉ cho chọn kệ ĐÃ CÓ SẴN cây thành phẩm (Phòng ra rễ, đúng kho) — tránh Kho mô gõ nhầm sang kệ trống
  // hoặc kệ khác loại. Luôn thêm kệ nguồn vào danh sách (đánh dấu "kệ gốc") dù kệ đó hiện có trống hay
  // không, vì đây là gợi ý mặc định — xem placeRepackOutput (src/lib/repack-placement.ts) cho phép riêng
  // kệ gốc bất kể còn hàng hay không.
  useEffect(() => {
    fetch(`/api/lots?roomType=PHONG_RA_RE&stage=THANH_PHAM&status=ACTIVE&warehouseId=${instruction.sourceShelf.warehouseId}`)
      .then((r) => r.json())
      .then((data: LotWithShelf[]) => {
        const codes = new Set<string>();
        if (Array.isArray(data)) {
          for (const l of data) if (l.shelf) codes.add(l.shelf.code);
        }
        codes.add(instruction.sourceShelf.code);
        setShelfOptions(
          Array.from(codes)
            .sort()
            .map((code) => ({ code, label: code === instruction.sourceShelf.code ? `${code} (kệ gốc)` : code }))
        );
      })
      .finally(() => setLoadingShelves(false));
  }, [instruction.sourceShelf.code, instruction.sourceShelf.warehouseId]);

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
        <Label className="text-xs">Kệ đích (chỉ kệ đã có sẵn cây thành phẩm)</Label>
        <Select
          items={shelfOptions.map((s) => ({ value: s.code, label: s.label }))}
          value={shelfCode || null}
          onValueChange={(v) => setShelfCode(v as string)}
          disabled={loadingShelves}
        >
          <SelectTrigger className="w-52 h-8 font-mono"><SelectValue placeholder="Chọn kệ đích" /></SelectTrigger>
          <SelectContent>
            {shelfOptions.map((s) => (
              <SelectItem key={s.code} value={s.code} className="font-mono">{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={submitting || loadingShelves} onClick={place}>
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
        Sắp xếp
      </Button>
    </div>
  );
}
