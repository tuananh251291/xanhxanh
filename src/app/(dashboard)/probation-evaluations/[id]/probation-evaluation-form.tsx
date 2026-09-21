"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ClipboardCheck, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Row = { id: string; label: string; type: "MANUAL" | "SPEED" | "CONTAMINATION"; selfScore: number | null; managerScore: number | null };
type Evaluation = {
  id: string; code: string; weekNumber: number; weekStart: string; weekEnd: string;
  status: "PENDING_SELF" | "PENDING_MANAGER" | "COMPLETED";
  sectionTitle: string;
  staff: { name: string; code: string };
  manager: { name: string; code: string } | null;
  selfComment: string | null; selfScoredAt: string | null;
  managerComment: string | null; managerScoredAt: string | null;
  managerPercent: number | null;
  result: "DAT" | "CAN_CAI_THIEN" | "KHONG_DAT" | null;
  rows: Row[];
};

const RESULT_LABEL: Record<string, string> = { DAT: "Đạt", CAN_CAI_THIEN: "Cần cải thiện", KHONG_DAT: "Không đạt" };
const RESULT_BADGE: Record<string, string> = {
  DAT: "bg-success-light text-success-foreground",
  CAN_CAI_THIEN: "bg-warning-light text-warning-foreground",
  KHONG_DAT: "bg-danger-light text-destructive",
};

export default function ProbationEvaluationForm({
  evaluationId, viewerRole,
}: {
  evaluationId: string;
  viewerRole: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/probation-evaluations/${evaluationId}`);
      if (!res.ok) { toast.error("Không tìm thấy đánh giá"); return; }
      const json: Evaluation = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  const isSelfTurn = data.status === "PENDING_SELF" && viewerRole === "CAY_MO";
  const isManagerTurn = data.status === "PENDING_MANAGER" && (viewerRole === "KY_THUAT" || viewerRole === "ADMIN" || viewerRole === "SUPER_ADMIN" || viewerRole === "ADMIN_KY_THUAT");
  const canEdit = isSelfTurn || isManagerTurn;

  const getScore = (row: Row) => {
    if (row.type !== "MANUAL") return String((isSelfTurn ? row.selfScore : row.managerScore) ?? 0);
    const key = row.id;
    if (scores[key] !== undefined) return scores[key];
    const existing = isSelfTurn ? row.selfScore : row.managerScore;
    return existing !== null && existing !== undefined ? String(existing) : "";
  };
  const setScore = (rowId: string, raw: string) => {
    const parsed = Math.floor(Number(raw));
    const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(10, parsed)) : 0;
    setScores((prev) => ({ ...prev, [rowId]: String(clamped) }));
  };

  const totalMax = data.rows.length * 10;
  const totalNow = data.rows.reduce((s, row) => s + (Number(getScore(row)) || 0), 0);
  const pctNow = totalMax > 0 ? Math.round((totalNow / totalMax) * 1000) / 10 : 0;

  const submit = async () => {
    if (!comment.trim()) { toast.error(isSelfTurn ? "Cần nhập ý kiến của nhân viên cấy mô" : "Cần nhập nhận xét của quản lý kĩ thuật"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/probation-evaluations/${evaluationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isSelfTurn ? "self" : "manager",
          items: data.rows.map((row) => ({ rowId: row.id, score: Number(getScore(row)) || 0 })),
          comment: comment.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(isSelfTurn ? "Đã gửi tự đánh giá — chờ NV kỹ thuật chấm lại" : "Đã hoàn thành chấm điểm");
      router.push("/probation-evaluations");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/probation-evaluations">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary-strong" /> Đánh giá tuần {data.weekNumber} — {data.sectionTitle}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            <span className="font-mono">{data.code}</span> · {data.staff.name} ({data.staff.code}) ·{" "}
            {format(new Date(data.weekStart), "dd/MM", { locale: vi })} – {format(new Date(data.weekEnd), "dd/MM/yyyy", { locale: vi })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Thang điểm đánh giá</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Xếp loại</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Ý nghĩa</th>
                  <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Điểm</th>
                  <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Tổng %</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b even:bg-primary-light/30">
                  <td className="px-3 py-2 font-medium text-success-foreground">Đạt</td>
                  <td className="px-3 py-2 text-text-secondary">Đáp ứng đầy đủ yêu cầu của tuần, có thể chuyển sang giai đoạn tiếp theo</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">9,0 – 10,0</td>
                  <td className="px-3 py-2 text-right">90 - 100</td>
                </tr>
                <tr className="border-b even:bg-primary-light/30">
                  <td className="px-3 py-2 font-medium text-warning-foreground">Cần cải thiện</td>
                  <td className="px-3 py-2 text-text-secondary">Đã nắm được phần lớn kỹ năng nhưng còn một số lỗi cần khắc phục</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">7,0 – dưới 9,0</td>
                  <td className="px-3 py-2 text-right">70 - &lt;90</td>
                </tr>
                <tr className="even:bg-primary-light/30">
                  <td className="px-3 py-2 font-medium text-destructive">Không đạt</td>
                  <td className="px-3 py-2 text-text-secondary">Chưa đáp ứng yêu cầu đào tạo, cần đào tạo lại hoặc kéo dài thử việc</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">Dưới 7,0</td>
                  <td className="px-3 py-2 text-right">&lt;70</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base w-12">STT</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Nội dung đánh giá</th>
                  <th className="text-right px-3 py-2 text-primary-strong font-bold text-base w-32">NV cấy mô tự chấm</th>
                  <th className="text-right px-3 py-2 text-primary-strong font-bold text-base w-32">NV kỹ thuật chấm</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const selfEditable = isSelfTurn && row.type === "MANUAL";
                  const managerEditable = isManagerTurn && row.type === "MANUAL";
                  const selfValue = row.type === "MANUAL"
                    ? (isSelfTurn ? getScore(row) : (row.selfScore ?? "—"))
                    : String(row.selfScore ?? 0);
                  const managerValue = row.type === "MANUAL"
                    ? (isManagerTurn ? getScore(row) : (row.managerScore ?? "—"))
                    : String(row.managerScore ?? 0);
                  return (
                    <tr key={row.id} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-3 py-2.5 align-top text-text-secondary">{row.id}</td>
                      <td className="px-3 py-2.5 align-top text-foreground">
                        {row.label}
                        {row.type !== "MANUAL" && <Badge className="ml-2 bg-info-light text-info-foreground align-middle">Tự động</Badge>}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        {selfEditable ? (
                          <Input type="number" min={0} max={10} step={1} value={getScore(row)} onChange={(e) => setScore(row.id, e.target.value)} className="w-20 h-8 ml-auto text-right" />
                        ) : (
                          <span className="text-text-secondary">{selfValue}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        {managerEditable ? (
                          <Input type="number" min={0} max={10} step={1} value={getScore(row)} onChange={(e) => setScore(row.id, e.target.value)} className="w-20 h-8 ml-auto text-right" />
                        ) : (
                          <span className="text-text-secondary">{managerValue}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-divider font-bold">
                  <td colSpan={2} className="px-3 py-2.5 text-right text-foreground">Tổng điểm (đang chấm)</td>
                  <td colSpan={2} className="px-3 py-2.5 text-right text-primary-strong">{canEdit ? `${totalNow} — ${pctNow}%` : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1">
            <Label>Ý kiến của nhân viên cấy mô</Label>
            {isSelfTurn ? (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            ) : (
              <p className="text-sm text-text-secondary">{data.selfComment || "—"}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Nhận xét của quản lý kĩ thuật</Label>
            {isManagerTurn ? (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            ) : (
              <p className="text-sm text-text-secondary">{data.managerComment || "—"}</p>
            )}
          </div>

          {data.status === "COMPLETED" && data.result && (
            <div className="rounded-lg bg-warning-light px-4 py-3 flex items-center justify-between flex-wrap gap-2">
              <p className="font-bold text-foreground">Kết quả tuần {data.weekNumber}: {data.managerPercent}%</p>
              <Badge className={RESULT_BADGE[data.result]}>{RESULT_LABEL[data.result]}</Badge>
            </div>
          )}

          {canEdit && (
            <Button className="w-full bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {isSelfTurn ? "Gửi tự đánh giá" : "Gửi kết quả chấm điểm"}
            </Button>
          )}
          {!canEdit && data.status !== "COMPLETED" && (
            <p className="text-sm text-text-muted text-center py-2">
              {data.status === "PENDING_SELF" ? "Đang chờ NV cấy mô tự chấm điểm" : "Đang chờ NV kỹ thuật chấm điểm"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
