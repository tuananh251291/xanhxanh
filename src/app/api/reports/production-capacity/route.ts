import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getWeekBuckets, getMonthBuckets, getWeekBucketsInRange, getMonthBucketsInRange, type WeekBucket } from "@/lib/report-utils";
import { computeActualSeries, forecastNextPeriod, type CapacityScope } from "@/lib/production-capacity";
import { addWeeks, addMonths, format, isValid } from "date-fns";
import { vi } from "date-fns/locale";

const DEFAULT_HISTORY_BUCKETS = 10;

// Trang "Năng suất sản xuất" (Admin) — đường xanh = sản lượng thực tế, mặc định 10 kỳ gần nhất, hoặc
// đúng quãng NV tự nhập (from/to, làm tròn chẵn tuần/chẵn tháng — xem getWeekBucketsInRange/
// getMonthBucketsInRange). Đường đỏ = dự báo ĐÚNG 1 kỳ kế tiếp TÍNH TỪ HÔM NAY (không đổi theo quãng
// xem lịch sử — xem forecastNextPeriod, src/lib/production-capacity.ts). Query params: unit=week|month,
// plantTypeId (bắt buộc), spec=mother|finished|total, scope=all|warehouse|staff, scopeId (bắt buộc nếu
// scope khác all), from/to (tuỳ chọn, yyyy-MM-dd — có cả 2 mới dùng quãng tự nhập, thiếu 1 trong 2 thì
// bỏ qua, dùng mặc định 10 kỳ gần nhất).
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

  // Đường xanh (lịch sử hiển thị) — dùng quãng NV tự nhập nếu có đủ from/to hợp lệ, không thì mặc định
  // 10 kỳ gần nhất tính tới hôm nay.
  let historyBuckets: WeekBucket[];
  if (fromParam && toParam) {
    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (!isValid(from) || !isValid(to)) return NextResponse.json({ message: "Quãng thời gian không hợp lệ" }, { status: 400 });
    const [start, end] = from <= to ? [from, to] : [to, from];
    historyBuckets = unit === "month" ? getMonthBucketsInRange(start, end) : getWeekBucketsInRange(start, end);
  } else {
    historyBuckets = unit === "month" ? getMonthBuckets(DEFAULT_HISTORY_BUCKETS) : getWeekBuckets(DEFAULT_HISTORY_BUCKETS);
  }

  // Dự báo — LUÔN tính từ kỳ hiện tại thực (hôm nay), không phụ thuộc quãng lịch sử đang xem, nên lấy
  // riêng 4 kỳ gần nhất (3 kỳ trước + kỳ hiện tại) thay vì dựa vào historyBuckets.
  const forecastAnchorBuckets = unit === "month" ? getMonthBuckets(4) : getWeekBuckets(4);
  const currentBucket = forecastAnchorBuckets[forecastAnchorBuckets.length - 1];
  const prevBuckets = forecastAnchorBuckets.slice(0, 3);

  const [actualPoints, forecast] = await Promise.all([
    computeActualSeries(plantTypeId, historyBuckets, scope),
    forecastNextPeriod(plantTypeId, prevBuckets, scope),
  ]);

  const valueFor = (p: { motherOutput: number; finishedOutput: number }) => {
    if (spec === "mother") return p.motherOutput;
    if (spec === "finished") return p.finishedOutput;
    return p.motherOutput + p.finishedOutput;
  };
  const forecastValue =
    spec === "mother" ? forecast.motherForecast : spec === "finished" ? forecast.finishedForecast : forecast.motherForecast + forecast.finishedForecast;

  const nextLabel =
    unit === "month"
      ? format(addMonths(currentBucket.start, 1), "MM/yyyy", { locale: vi })
      : format(addWeeks(currentBucket.start, 1), "dd/MM", { locale: vi });

  const data: Record<string, string | number>[] = [
    ...historyBuckets.map((b, i) => ({ period: b.label, "Thực tế": Math.round(valueFor(actualPoints[i])) })),
    { period: nextLabel, "Dự kiến": Math.round(forecastValue) },
  ];

  return NextResponse.json({ data });
}
