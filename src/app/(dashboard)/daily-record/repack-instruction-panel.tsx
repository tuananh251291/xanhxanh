"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, PackageCheck, PackageX, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";

type RepackItem = {
  id: string;
  code: string;
  status: "ASSIGNED" | "IN_PROGRESS";
  inputQuantity: number;
  inputStageCode: string;
  outputStageCode: string;
  expectedOutputQuantity: number;
  staffConfirmedAt: string | null;
  plantType: { code: string; name: string };
  sourceShelf: { code: string };
  sourceLot: { code: string };
};

// Bảng THỨ 2, tách biệt hoàn toàn với bảng tuần chỉ định cấy thường ở trên — hiện "Chỉ định cấy xử lý"
// (RepackInstruction) đang chờ NV cấy mô xử lý, chạy SONG SONG không ảnh hưởng gì tới chỉ định thường
// (không dùng chung model, xem prisma/schema.prisma). Dùng CHUNG cho cả Giao diện thường
// (daily-record/page.tsx) và Giao diện cơ bản (dashboard-basic/cap-nhat-so-lieu/daily-record-simple-form.tsx)
// — cùng tiền lệ EndInstructionEarlyButton đã dùng chung 2 giao diện.
export default function RepackInstructionPanel() {
  const router = useRouter();
  const [items, setItems] = useState<RepackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [passed, setPassed] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [insufficientNote, setInsufficientNote] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/repack-instructions?status=ASSIGNED").then((r) => r.json()),
      fetch("/api/repack-instructions?status=IN_PROGRESS").then((r) => r.json()),
    ])
      .then(([assigned, inProgress]: [RepackItem[], RepackItem[]]) => {
        const merged = [...(Array.isArray(assigned) ? assigned : []), ...(Array.isArray(inProgress) ? inProgress : [])];
        setItems(merged);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmReceived = async (item: RepackItem) => {
    if (!window.confirm(`Xác nhận đã nhận bàn giao lô để xử lý (${item.inputQuantity.toLocaleString("vi-VN")} cây ${item.inputStageCode})?`)) return;
    setSubmittingId(item.id);
    try {
      const res = await fetch(`/api/repack-instructions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmReceived: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã nhận bàn giao — bắt đầu xử lý");
      load();
      router.refresh();
    } finally {
      setSubmittingId(null);
    }
  };

  const reportInsufficient = async (item: RepackItem) => {
    if (!window.confirm(`Báo số lượng thực tế trên kệ ${item.sourceShelf.code} KHÔNG khớp chỉ định (cần ${item.inputQuantity.toLocaleString("vi-VN")} cây ${item.inputStageCode})? Chỉ định sẽ được trả lại cho Kho mô gán lại.`)) return;
    setSubmittingId(item.id);
    try {
      const res = await fetch(`/api/repack-instructions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportInsufficientQuantity: { note: insufficientNote[item.id]?.trim() || undefined } }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã báo Kho mô — chỉ định chờ gán lại");
      load();
      router.refresh();
    } finally {
      setSubmittingId(null);
    }
  };

  const handBack = async (item: RepackItem) => {
    const p = Number(passed[item.id]) || 0;
    const f = Number(failed[item.id]) || 0;
    if (p + f <= 0) { toast.error("Nhập số lượng đạt/không đạt"); return; }
    if (p + f > item.expectedOutputQuantity) { toast.error("Tổng số đạt + không đạt vượt quá số lượng dự kiến"); return; }
    if (!window.confirm("Xác nhận hoàn thành và bàn giao kết quả — không sửa lại được sau khi gửi?")) return;
    setSubmittingId(item.id);
    try {
      const res = await fetch(`/api/repack-instructions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handBack: { reportedPassedQuantity: p, reportedFailedQuantity: f } }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã bàn giao kết quả xử lý — chờ Kho mô kiểm tra");
      load();
      router.refresh();
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading || items.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary-strong" /> Chỉ định cấy xử lý
        </h2>

        {items.map((item) => {
          const overdue = item.status === "IN_PROGRESS" && item.staffConfirmedAt && differenceInCalendarDays(new Date(), new Date(item.staffConfirmedAt)) >= 1;
          return (
            <div key={item.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-medium text-foreground">
                  <span className="font-mono">{item.code}</span> — {item.plantType.code} — {item.sourceLot.code} ({item.sourceShelf.code})
                </p>
                {overdue && (
                  <Badge className="bg-warning-light text-warning-foreground">
                    <TriangleAlert className="w-3 h-3 mr-1" /> Đã quá 1 ngày
                  </Badge>
                )}
              </div>
              <p className="text-xs text-text-secondary">
                {item.inputQuantity.toLocaleString("vi-VN")} cây {item.inputStageCode} → dự kiến {item.expectedOutputQuantity.toLocaleString("vi-VN")} cây {item.outputStageCode}
              </p>

              {item.status === "ASSIGNED" ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    size="sm" className="bg-primary hover:bg-primary-hover"
                    disabled={submittingId === item.id}
                    onClick={() => confirmReceived(item)}
                  >
                    {submittingId === item.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
                    Nhận bàn giao
                  </Button>
                  <div className="space-y-1">
                    <Label className="text-xs">Ghi chú (không bắt buộc)</Label>
                    <Input
                      className="w-48 h-8"
                      placeholder="VD: kệ chỉ còn 30 cây"
                      value={insufficientNote[item.id] ?? ""}
                      onChange={(e) => setInsufficientNote((p) => ({ ...p, [item.id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    size="sm" variant="destructive" className="h-8"
                    disabled={submittingId === item.id}
                    onClick={() => reportInsufficient(item)}
                  >
                    {submittingId === item.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageX className="w-3.5 h-3.5 mr-1.5" />}
                    Số lượng không đủ
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Đạt</Label>
                    <Input type="number" min={0} className="w-24 h-8" value={passed[item.id] ?? ""} onChange={(e) => setPassed((p) => ({ ...p, [item.id]: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Không đạt</Label>
                    <Input type="number" min={0} className="w-24 h-8" value={failed[item.id] ?? ""} onChange={(e) => setFailed((p) => ({ ...p, [item.id]: e.target.value }))} />
                  </div>
                  <Button
                    size="sm" className="h-8 bg-primary hover:bg-primary-hover"
                    disabled={submittingId === item.id}
                    onClick={() => handBack(item)}
                  >
                    {submittingId === item.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
                    Hoàn thành – Bàn giao kết quả
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
