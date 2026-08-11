import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getWeekBuckets, getMonthBuckets, getWeekBucketsInRange, getMonthBucketsInRange, type WeekBucket } from "@/lib/report-utils";
import { computeActualSeries, forecastNextPeriod, type CapacityScope } from "@/lib/production-capacity";
import { addWeeks, addMonths, endOfWeek, endOfMonth, format, isValid } from "date-fns";
import { vi } from "date-fns/locale";

const DEFAULT_HISTORY_BUCKETS = 10;

// Trang "Năng suất sản xuất" (Admin). Trục ngang gồm mọi kỳ từ "from" tới "to" NV tự nhập (làm tròn
// chẵn tuần/chẵn tháng — getWeekBucketsInRange/getMonthBucketsInRange), hoặc mặc định 10 kỳ gần nhất +
// 1 kỳ kế tiếp nếu không nhập gì. Đường xanh (Thực tế) phủ mọi kỳ <= kỳ hiện tại THẬT (hôm nay, không
// phụ thuộc quãng đang xem). Đường đỏ (Dự kiến) phủ mọi kỳ tương lai (> hôm nay) trong quãng đã chọn —
// dùng CHUNG 1 giá trị dự báo (tồn mẫu mẹ hiện có × hệ số trung bình 3 kỳ trước, không đổi theo từng kỳ
// tương lai) cho tới hết "to". Kỳ hiện tại có CẢ 2 khoá Thực tế/Dự kiến (cùng giá trị thực tế) để 2
// đường nối liền, không đứt đoạn. Query params: unit=week|month, plantTypeId (bắt buộc),
// spec=mother|finished|total, scope=all|warehouse|staff, scopeId (bắt buộc nếu scope khác all), from/to
// (tuỳ chọn, yyyy-MM-dd — có cả 2 mới dùng quãng tự nhập, "to" có thể ở tương lai để kéo dài đường đỏ).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const unit = searchParams.get("unit") === "month" ? "month" : "week";
  const plantTypeId = searchParams.get("plantTypeId");
  const spec = searchParams.get("spec") === "mother" || searchParams.get("spec") === "finished" ? searchParams.get("spec") : "total";
  const scopeParam = searchParams.get("scope");
  const scopeId = searchParams.get("scopeId");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (!plantTypeId) return NextResponse.json({ message: "Thiếu mã sản phẩm" }, { status: 400 });

  let scope: CapacityScope = { kind: "ALL" };
  if (scopeParam === "warehouse") {
    if (!scopeId) return NextResponse.json({ message: "Thiếu kho sản xuất" }, { status: 400 });
    scope = { kind: "WAREHOUSE", warehouseId: scopeId };
  } else if (scopeParam === "staff") {
    if (!scopeId) return NextResponse.json({ message: "Thiếu nhân sự" }, { status: 400 });
    scope = { kind: "STAFF", staffId: scopeId };
  }

  // Toàn bộ kỳ hiển thị trên trục ngang — có thể vượt quá hôm nay nếu NV chọn "Đến" trong tương lai.
  let buckets: WeekBucket[];
  if (fromParam && toParam) {
    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (!isValid(from) || !isValid(to)) return NextResponse.json({ message: "Quãng thời gian không hợp lệ" }, { status: 400 });
    const [start, end] = from <= to ? [from, to] : [to, from];
    buckets = unit === "month" ? getMonthBucketsInRange(start, end) : getWeekBucketsInRange(start, end);
  } else {
    const history = unit === "month" ? getMonthBuckets(DEFAULT_HISTORY_BUCKETS) : getWeekBuckets(DEFAULT_HISTORY_BUCKETS);
    const last = history[history.length - 1];
    const nextStart = unit === "month" ? addMonths(last.start, 1) : addWeeks(last.start, 1);
    const nextEnd = unit === "month" ? endOfMonth(nextStart) : endOfWeek(nextStart, { weekStartsOn: 1 });
    const nextLabel = format(nextStart, unit === "month" ? "MM/yyyy" : "dd/MM", { locale: vi });
    buckets = [...history, { start: nextStart, end: nextEnd, label: nextLabel }];
  }

  // Kỳ hiện tại THẬT (hôm nay) — mốc phân định Thực tế (<=) / Dự kiến (>), không phụ thuộc quãng đang
  // xem, nên tính riêng — cùng 3 kỳ liền trước để tính hệ số dự báo (xem forecastNextPeriod).
  const [todayBucket] = unit === "month" ? getMonthBuckets(1) : getWeekBuckets(1);
  const prevBuckets = (unit === "month" ? getMonthBuckets(4) : getWeekBuckets(4)).slice(0, 3);

  const historyBuckets = buckets.filter((b) => b.start <= todayBucket.start);
  const [actualPoints, forecast] = await Promise.all([
    computeActualSeries(plantTypeId, historyBuckets, scope),
    forecastNextPeriod(plantTypeId, prevBuckets, scope),
  ]);

  const valueFor = (p: { motherOutput: number; finishedOutput: number }) => {
    if (spec === "mother") return p.motherOutput;
    if (spec === "finished") return p.finishedOutput;
    return p.motherOutput + p.finishedOutput;
  };
  const forecastValue = Math.round(
    spec === "mother" ? forecast.motherForecast : spec === "finished" ? forecast.finishedForecast : forecast.motherForecast + forecast.finishedForecast
  );

  const data: Record<string, string | number>[] = buckets.map((b) => {
    const row: Record<string, string | number> = { period: b.label };
    if (b.start <= todayBucket.start) {
      const idx = historyBuckets.findIndex((h) => h.start.getTime() === b.start.getTime());
      const actualValue = idx !== -1 ? Math.round(valueFor(actualPoints[idx])) : 0;
      row["Thực tế"] = actualValue;
      if (b.start.getTime() === todayBucket.start.getTime()) row["Dự kiến"] = actualValue;
    } else {
      row["Dự kiến"] = forecastValue;
    }
    return row;
  });

  return NextResponse.json({ data });
}
