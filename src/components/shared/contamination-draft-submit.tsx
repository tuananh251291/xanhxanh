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

function DraftLinesTable({ lines }: { lines: DraftLine[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-divider">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light">
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">NV nguồn</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã cây</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Quy cách</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Số lượng</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-divider last:border-0 even:bg-background">
              <td className="px-3 py-1.5 text-foreground">{l.staffName ?? "Chưa rõ NV / tồn cũ"}</td>
              <td className="px-3 py-1.5 font-mono text-foreground whitespace-nowrap">{l.plantTypeCode}</td>
              <td className="px-3 py-1.5 text-foreground">{l.stageCode}</td>
              <td className="px-3 py-1.5 text-right font-medium text-foreground">{l.quantity.toLocaleString("vi-VN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 1 phiếu (Hủy hoặc Trồng) đang gộp, hiện riêng khỏi phiếu loại kia — khớp đúng cách Admin sẽ thấy SAU
// khi gửi (2 phiếu tách riêng theo type, xem contamination-proposal-board.tsx groupIntoBatches theo
// type + batchCode), để Kho mô rà trước khi gửi cũng thấy y hệt cách nó sẽ tách ra.
function DraftTypeSection({ title, lines, defaultExpanded }: { title: string; lines: DraftLine[]; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (lines.length === 0) return null;
  const total = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="space-y-2 rounded-lg border border-divider p-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-xs text-text-secondary">{lines.length} dòng — {total.toLocaleString("vi-VN")} cây/cụm</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Ẩn</> : <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Xem</>}
        </Button>
      </div>
      {expanded && <DraftLinesTable lines={lines} />}
    </div>
  );
}

// "Phiếu chung" đã được Kho mô "Gộp phiếu" từ nhiều NV cấy mô/nhiều ngày (xem
// dark-room-check/contamination-personal-board.tsx) — chỉ còn việc rà lại rồi bấm "Gửi đề xuất
// trồng/hủy" gửi Admin duyệt, dùng chung cho cả mục "Kiểm tra kho nhiễm cá nhân" (nhiệm vụ ngày) lẫn
// nhiệm vụ tuần "Gửi đề xuất Trồng/Hủy" (xem dashboard/page.tsx). Hiện tách riêng phiếu Hủy/phiếu Trồng
// (2 section riêng) để khớp đúng cách server tách thành 2 batchCode/2 phiếu lúc gửi (xem POST
// /api/contamination-proposal-drafts/submit) — 1 lần bấm "Gửi" vẫn gửi cả 2 phiếu cùng lúc.
export default function ContaminationDraftSubmit({ defaultExpanded = false, onSubmitted }: { defaultExpanded?: boolean; onSubmitted?: () => void }) {
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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

  const huyLines = draftLines.filter((l) => l.type === "HUY");
  const trongLines = draftLines.filter((l) => l.type === "TRONG");

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="font-medium text-foreground">Phiếu chung đang gộp</p>
            <p className="text-sm text-text-secondary">
              {draftLines.length === 0
                ? "Chưa có dòng nào"
                : `${huyLines.length} dòng hủy, ${trongLines.length} dòng trồng — bấm "Gửi đề xuất trồng/hủy" để gửi Admin duyệt`}
            </p>
          </div>
          <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={submitting || draftLines.length === 0} onClick={submitDraft}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
            Gửi đề xuất trồng/hủy
          </Button>
        </div>
        {draftLines.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <DraftTypeSection title="Phiếu Hủy đang gộp" lines={huyLines} defaultExpanded={defaultExpanded} />
            <DraftTypeSection title="Phiếu Trồng đang gộp" lines={trongLines} defaultExpanded={defaultExpanded} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
