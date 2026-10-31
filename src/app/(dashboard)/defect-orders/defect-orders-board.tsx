"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Eye, Search } from "lucide-react";
import { format } from "date-fns";
import { StarRating } from "@/components/shared/order-feedback-form";
import OrderFeedbackDetail, { type OrderFeedbackView } from "@/components/shared/order-feedback-detail";
import { ORDER_FEEDBACK_CAUSE_LABELS, type OrderFeedbackCauseValue } from "@/lib/order-feedback-constants";

type Row = {
  orderId: string; orderCode: string; customer: string; saleId: string; saleName: string; shippedAt: string | null; quantity: number;
  feedback: OrderFeedbackView;
};
type Filter = "ALL" | "PENDING" | OrderFeedbackCauseValue;
const FILTER_LABELS: Record<Filter, string> = { ALL: "Tất cả", PENDING: "Chờ xác nhận nguyên nhân", ...ORDER_FEEDBACK_CAUSE_LABELS };

export default function DefectOrdersBoard({ rows, canExplain, showTeam, currentUserId, initialOpenId }: {
  rows: Row[]; canExplain: boolean; showTeam: boolean; currentUserId: string; initialOpenId: string | null;
}) {
  const [filter, setFilter] = useState<Filter>(canExplain ? "PENDING" : "ALL");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialOpenId);

  const count = (f: Filter) => rows.filter((r) => f === "ALL" || (f === "PENDING" ? !r.feedback.cause : r.feedback.cause === f)).length;
  const keyword = q.trim().toLowerCase();
  const shown = rows.filter((r) =>
    (filter === "ALL" || (filter === "PENDING" ? !r.feedback.cause : r.feedback.cause === filter)) &&
    (!keyword || [r.orderCode, r.customer, r.saleName].some((s) => s.toLowerCase().includes(keyword))),
  );
  const opened = rows.find((r) => r.feedback.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><AlertTriangle className="w-6 h-6 text-primary-strong" /> Đơn hàng có lỗi</h1>
        <p className="text-text-secondary text-sm mt-1">
          Đơn đã xuất bị khách đánh giá dưới 5 sao.{showTeam ? " Gồm đơn của bạn và của NV bạn quản lý (nếu có)." : ""}
          {canExplain ? " Bấm \"Xác nhận nguyên nhân\" để chọn lỗi do Kho thành phẩm hay phòng sản xuất và giải trình." : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["ALL", "PENDING", "FINISHED_WAREHOUSE", "PRODUCTION"] as Filter[]).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{FILTER_LABELS[f]} · {count(f)}</Button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input className="pl-8 w-64" placeholder="Mã đơn, khách hàng, NV bán hàng…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {shown.length === 0 ? (
            <p className="py-16 text-center text-text-muted">{rows.length === 0 ? "Chưa có đơn hàng nào bị đánh giá lỗi" : "Không có đơn phù hợp bộ lọc"}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    {["Mã đơn", "Khách hàng", "NV bán hàng", "Xuất kho", "Đánh giá", "Nguyên nhân"].map((h) => <th key={h} className="text-left px-4 py-3 text-base text-primary-strong font-bold">{h}</th>)}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const pending = !r.feedback.cause;
                    return (
                      <tr key={r.feedback.id} className="border-b border-divider last:border-0 even:bg-primary-light/30 align-top">
                        <td className="px-4 py-3 font-mono">
                          <Link href={`/orders/list/${r.orderId}`} className="text-info-foreground hover:underline">{r.orderCode}</Link>
                          <p className="text-xs text-text-muted font-sans">{r.quantity.toLocaleString("vi-VN")} cây</p>
                        </td>
                        <td className="px-4 py-3">{r.customer}</td>
                        <td className="px-4 py-3">{r.saleName}{showTeam && r.saleId !== currentUserId && <p className="text-xs text-text-muted">NV bạn quản lý</p>}</td>
                        <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{r.shippedAt ? format(new Date(r.shippedAt), "dd/MM/yyyy") : "—"}</td>
                        <td className="px-4 py-3">
                          <StarRating value={r.feedback.rating} size="w-4 h-4" />
                          <p className="text-xs text-text-muted mt-0.5">{format(new Date(r.feedback.createdAt), "dd/MM/yyyy")}</p>
                        </td>
                        <td className="px-4 py-3">
                          {r.feedback.cause
                            ? <Badge variant={r.feedback.cause === "FINISHED_WAREHOUSE" ? "in-progress" : "info"}>{ORDER_FEEDBACK_CAUSE_LABELS[r.feedback.cause]}</Badge>
                            : <Badge variant="overdue">Chờ xác nhận</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canExplain && pending ? (
                            <Button size="sm" className="h-8" onClick={() => setOpenId(r.feedback.id)}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Xác nhận nguyên nhân</Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-8" onClick={() => setOpenId(r.feedback.id)}><Eye className="w-3.5 h-3.5 mr-1" /> Xem nguyên nhân</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!opened} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Đơn <span className="font-mono">{opened?.orderCode}</span> — phản hồi khách hàng</DialogTitle></DialogHeader>
          {opened && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Khách {opened.customer} · NV bán hàng {opened.saleName} · xuất kho {opened.shippedAt ? format(new Date(opened.shippedAt), "dd/MM/yyyy") : "—"} · {opened.quantity.toLocaleString("vi-VN")} cây
              </p>
              <OrderFeedbackDetail feedback={opened.feedback} canExplain={canExplain} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
