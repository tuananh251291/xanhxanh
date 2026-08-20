"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

type DraftLine = {
  id: string; staffId: string; staffName: string | null; type: "HUY" | "TRONG";
  plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number;
};

// "Phiếu chung" đã được Kho mô "Gộp phiếu" từ nhiều NV cấy mô/nhiều ngày (xem
// dark-room-check/contamination-personal-board.tsx) — chỉ còn việc rà lại rồi bấm "Gửi đề xuất
// trồng/hủy" gửi Admin duyệt, dùng chung cho cả mục "Kiểm tra kho nhiễm cá nhân" (nhiệm vụ ngày) lẫn
// nhiệm vụ tuần "Gửi đề xuất Trồng/Hủy" (xem dashboard/page.tsx).
export default function ContaminationDraftSubmit({ defaultExpanded = false, onSubmitted }: { defaultExpanded?: boolean; onSubmitted?: () => void }) {
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDraft, setShowDraft] = useState(defaultExpanded);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contamination-proposal-drafts");
      const data = await res.json();
      setDraftLines(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitDraft = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/contamination-proposal-drafts/submit", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã gửi ${json.count} đề xuất — chờ Admin duyệt`);
      load();
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="font-medium text-foreground">Phiếu chung đang gộp</p>
            <p className="text-sm text-text-secondary">
              {draftLines.length === 0 ? "Chưa có dòng nào" : `${draftLines.length} dòng — bấm "Gửi đề xuất trồng/hủy" để gửi Admin duyệt`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {draftLines.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setShowDraft((v) => !v)}>
                {showDraft ? <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Ẩn</> : <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Xem</>}
              </Button>
            )}
            <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={submitting || draftLines.length === 0} onClick={submitDraft}>
              {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              Gửi đề xuất trồng/hủy
            </Button>
          </div>
        </div>
        {showDraft && draftLines.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-divider">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">NV nguồn</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Loại</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã cây</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Quy cách</th>
                  <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Số lượng</th>
                </tr>
              </thead>
              <tbody>
                {draftLines.map((l) => (
                  <tr key={l.id} className="border-b border-divider last:border-0 even:bg-background">
                    <td className="px-3 py-1.5 text-foreground">{l.staffName ?? "Chưa rõ NV / tồn cũ"}</td>
                    <td className="px-3 py-1.5 text-foreground">{l.type === "HUY" ? "Hủy" : "Trồng"}</td>
                    <td className="px-3 py-1.5 font-mono text-foreground whitespace-nowrap">{l.plantTypeCode}</td>
                    <td className="px-3 py-1.5 text-foreground">{l.stageCode}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-foreground">{l.quantity.toLocaleString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
