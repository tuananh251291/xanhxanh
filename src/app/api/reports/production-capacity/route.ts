import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getWeekBuckets, getMonthBuckets, type WeekBucket } from "@/lib/report-utils";
import { computeActualSeries, forecastNextPeriod, type CapacityScope } from "@/lib/production-capacity";
import { addWeeks, addMonths, format } from "date-fns";
import { vi } from "date-fns/locale";

const HISTORY_BUCKETS = 10;

// Trang "Năng suất sản xuất" (Admin) — đường xanh = sản lượng thực tế 10 kỳ gần nhất, đường đỏ = dự
// báo ĐÚNG 1 kỳ kế tiếp (xem forecastNextPeriod, src/lib/production-capacity.ts). Query params:
// unit=week|month, plantTypeId (bắt buộc), spec=mother|finished|total, scope=all|warehouse|staff,
// scopeId (bắt buộc nếu scope khác all).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const unit = searchParams.get("unit") === "month" ? "month" : "week";
  const plantTypeId = searchParams.get("plantTypeId");
  const spec = searchParams.get("spec") === "mother" || searchParams.get("spec") === "finished" ? searchParams.get("spec") : "total";
  const scopeParam = searchParams.get("scope");
  const scopeId = searchParams.get("scopeId");

  if (!plantTypeId) return NextResponse.json({ message: "Thiếu mã sản phẩm" }, { status: 400 });

  let scope: CapacityScope = { kind: "ALL" };
  if (scopeParam === "warehouse") {
    if (!scopeId) return NextResponse.json({ message: "Thiếu kho sản xuất" }, { status: 400 });
    scope = { kind: "WAREHOUSE", warehouseId: scopeId };
  } else if (scopeParam === "staff") {
    if (!scopeId) return NextResponse.json({ message: "Thiếu nhân sự" }, { status: 400 });
    scope = { kind: "STAFF", staffId: scopeId };
  }

  const buckets: WeekBucket[] = unit === "month" ? getMonthBuckets(HISTORY_BUCKETS) : getWeekBuckets(HISTORY_BUCKETS);
  const currentBucket = buckets[buckets.length - 1];
  const prevBuckets = buckets.slice(-4, -1); // 3 kỳ liền trước kỳ hiện tại

  const [actualPoints, forecast] = await Promise.all([
    computeActualSeries(plantTypeId, buckets, scope),
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
    ...buckets.map((b, i) => ({ period: b.label, "Thực tế": Math.round(valueFor(actualPoints[i])) })),
    { period: nextLabel, "Dự kiến": Math.round(forecastValue) },
  ];

  return NextResponse.json({ data });
}
