import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { getWeekBuckets, getMonthBuckets, getWeekBucketsInRange, getMonthBucketsInRange, type WeekBucket } from "@/lib/report-utils";
import { computeActualSeries, simulateWeeklyForecast, type CapacityScope } from "@/lib/production-capacity";
import { addWeeks, addMonths, endOfWeek, endOfMonth, format, isValid } from "date-fns";
import { vi } from "date-fns/locale";

const DEFAULT_HISTORY_BUCKETS = 10;

// Trang "Năng suất sản xuất" (Admin). Trục ngang gồm mọi kỳ từ "from" tới "to" NV tự nhập (làm tròn
// chẵn tuần/chẵn tháng — getWeekBucketsInRange/getMonthBucketsInRange), hoặc mặc định 10 kỳ gần nhất +
// 1 kỳ kế tiếp nếu không nhập gì. Đường xanh (Thực tế) phủ mọi kỳ <= kỳ hiện tại THẬT (hôm nay, không
// phụ thuộc quãng đang xem). Đường đỏ (Dự kiến) phủ mọi kỳ tương lai (> hôm nay) trong quãng đã chọn —
// MÔ PHỎNG TỪNG TUẦN (simulateWeeklyForecast) rồi cộng dồn các tuần rơi vào đúng kỳ hiển thị: mỗi tuần
// chỉ (các) Nhóm tuần mẫu mẹ ĐÚNG LƯỢT xoay vòng mới "cấy" (không phải chỉ 1 Nhóm duy nhất áp dụng suốt —
// qua nhiều tuần/tháng LẦN LƯỢT cả N Nhóm đều tới lượt, mỗi Nhóm có 1 chuỗi cộng dồn RIÊNG cách nhau N
// tuần = transferWaitWeeks). Hệ số trung bình luôn tính theo 3 TUẦN GẦN NHẤT CÓ DỮ LIỆU thật tính tới
// "now" (computeAverageRatios) — bất kể đơn vị đang xem Tuần hay Tháng, không bao giờ dùng dữ liệu tương
// lai. Kỳ hiện tại có CẢ 2 khoá Thực tế/Dự kiến (cùng giá trị thực tế) để 2 đường nối liền trên biểu đồ,
// không đứt đoạn — vốn dự báo và sản lượng thực tế là 2 khái niệm khác nhau (năng LỰC tối đa có thể đạt
// nếu tận dụng hết tồn đủ tuổi mọi Nhóm, không phải ngoại suy xu hướng quá khứ) nên số có thể lệch hẳn
// nhau ngay tại điểm nối. Query params: unit=week|month, plantTypeId (bắt buộc),
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
  // xem, nên tính riêng.
  const now = new Date();
  const [todayBucket] = unit === "month" ? getMonthBuckets(1) : getWeekBuckets(1);

  const historyBuckets = buckets.filter((b) => b.start <= todayBucket.start);
  const futureBuckets = buckets.filter((b) => b.start > todayBucket.start);
  const [actualPoints, weeklyForecast] = await Promise.all([
    computeActualSeries(plantTypeId, historyBuckets, scope),
    futureBuckets.length > 0
      ? simulateWeeklyForecast(plantTypeId, scope, now, futureBuckets[futureBuckets.length - 1].end)
      : Promise.resolve([]),
  ]);

  const valueFor = (p: { motherOutput: number; finishedOutput: number }) => {
    if (spec === "mother") return p.motherOutput;
    if (spec === "finished") return p.finishedOutput;
    return p.motherOutput + p.finishedOutput;
  };

  const data: Record<string, string | number>[] = buckets.map((b) => {
    const row: Record<string, string | number> = { period: b.label };
    if (b.start <= todayBucket.start) {
      const idx = historyBuckets.findIndex((h) => h.start.getTime() === b.start.getTime());
      const actualValue = idx !== -1 ? Math.round(valueFor(actualPoints[idx])) : 0;
      row["Thực tế"] = actualValue;
      if (b.start.getTime() === todayBucket.start.getTime()) row["Dự kiến"] = actualValue;
    } else {
      // Cộng dồn mọi tuần mô phỏng rơi vào đúng kỳ hiển thị này — 1 kỳ Tháng thường gồm ~4 tuần, mỗi
      // tuần có thể là 1 Nhóm tuần mẫu mẹ khác nhau tới lượt cấy (xem simulateWeeklyForecast).
      const pointsInBucket = weeklyForecast.filter((p) => p.weekStart >= b.start && p.weekStart <= b.end);
      const summed = pointsInBucket.reduce(
        (acc, p) => ({ motherOutput: acc.motherOutput + p.motherForecast, finishedOutput: acc.finishedOutput + p.finishedForecast }),
        { motherOutput: 0, finishedOutput: 0 }
      );
      row["Dự kiến"] = Math.round(valueFor(summed));
    }
    return row;
  });

  return NextResponse.json({ data });
}
