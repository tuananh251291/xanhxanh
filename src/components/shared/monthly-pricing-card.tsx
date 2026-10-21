import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarCheck } from "lucide-react";
import { monthLabelVi } from "@/lib/price-list-shared";
import type { getMonthlyPricingStatus } from "@/lib/pricing-reminders";

type Status = Awaited<ReturnType<typeof getMonthlyPricingStatus>>;

// Thẻ "Việc hằng tháng" trên Tổng quan — NV Trợ lý: bảng giá tháng sau từng thị trường; NV Kế toán: tỉ giá tháng sau.
export default function MonthlyPricingCard({ role, status }: { role: "TRO_LY" | "KE_TOAN"; status: Status }) {
  const isTroLy = role === "TRO_LY";
  const total = isTroLy ? status.priceStatus.length : status.currencies.length;
  const missing = isTroLy ? status.priceMissing.length : status.rateMissing.length;
  const done = missing === 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" />
            {isTroLy ? `Cập nhật bảng giá ${monthLabelVi(status.nextMonth)}` : `Cập nhật tỉ giá ${monthLabelVi(status.nextMonth)}`}
          </CardTitle>
          <Badge variant={done ? "completed" : "in-progress"}>{done ? "Đã xong" : `Còn ${missing}/${total}`}</Badge>
        </div>
        <p className="text-xs text-text-secondary">Hạn: ngày cuối tháng · nhắc từ ngày 28</p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isTroLy ? (
          <div className="flex flex-wrap gap-1.5">
            {status.priceStatus.map((m) => (
              <Badge key={m.id} variant={m.status === "APPROVED" ? "completed" : m.status === "PENDING" ? "info" : "outline"}>
                {m.code} · {m.status === "APPROVED" ? "đã duyệt" : m.status === "PENDING" ? "chờ duyệt" : "chưa tải"}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-text-secondary">{done ? "Đã nhập đủ tỉ giá." : `Còn thiếu: ${status.rateMissing.join(", ")}`}</p>
        )}
        <Link href={isTroLy ? "/price-lists" : "/exchange-rates"}>
          <Button size="sm">{isTroLy ? "Mở Bảng giá tháng" : "Mở Tỉ giá tháng"}</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
