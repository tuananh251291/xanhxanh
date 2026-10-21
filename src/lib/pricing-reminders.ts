import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { rateCurrencies } from "@/lib/price-list";
import { addMonthsKey, monthKeyToDate, monthLabelVi, vnMonthKey } from "@/lib/price-list-shared";

// Việc hằng tháng (hạn ngày cuối tháng, nhắc từ ngày 28 giờ VN):
// - NV Trợ lý: "Cập nhật bảng giá tháng sau" — mỗi thị trường đang dùng bảng giá (priceListEnabled) 1 file Excel.
// - NV Kế toán: "Cập nhật tỉ giá tháng sau" — mọi đơn vị tiền của thị trường đang hoạt động (rateCurrencies).
export const REMINDER_START_DAY = 28;

export async function getMonthlyPricingStatus() {
  const nextMonth = addMonthsKey(vnMonthKey(), 1);
  const date = monthKeyToDate(nextMonth);
  const [markets, lists, currencies, rates] = await Promise.all([
    prisma.market.findMany({ where: { isActive: true, priceListEnabled: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.priceList.findMany({ where: { month: date, status: { in: ["PENDING", "APPROVED"] } }, select: { marketId: true, status: true } }),
    rateCurrencies(),
    prisma.exchangeRate.findMany({ where: { month: date }, select: { currency: true } }),
  ]);
  const priceStatus = markets.map((m) => {
    const mine = lists.filter((l) => l.marketId === m.id);
    return { ...m, status: mine.some((l) => l.status === "APPROVED") ? "APPROVED" : mine.length ? "PENDING" : "MISSING" } as const;
  });
  const haveRates = new Set(rates.map((r) => r.currency));
  return {
    nextMonth,
    priceStatus,
    priceMissing: priceStatus.filter((p) => p.status === "MISSING"),
    rateMissing: currencies.filter((c) => !haveRates.has(c)),
    currencies,
  };
}

const vnDay = () => Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).slice(8, 10));
const vnDate = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

// Gọi lúc NV Trợ lý / NV Kế toán mở Tổng quan — từ ngày 28, mỗi ngày tối đa 1 thông báo/người cho tới khi xong.
export async function ensureMonthlyPricingReminders(user: { id: string; role: string | null | undefined }) {
  if (user.role !== "TRO_LY" && user.role !== "KE_TOAN") return;
  if (vnDay() < REMINDER_START_DAY) return;
  const st = await getMonthlyPricingStatus();
  const isTroLy = user.role === "TRO_LY";
  const missing = isTroLy ? st.priceMissing.map((m) => m.name) : st.rateMissing;
  if (missing.length === 0) return;
  const type = isTroLy ? "PRICE_LIST_MONTHLY_DUE" : "EXCHANGE_RATE_MONTHLY_DUE";
  const relatedId = `${type}:${vnDate()}:${user.id}`;
  if (await prisma.alert.findFirst({ where: { type, relatedId } })) return;
  await createAlert({
    type,
    title: isTroLy ? `Nhắc: cập nhật bảng giá ${monthLabelVi(st.nextMonth)}` : `Nhắc: cập nhật tỉ giá ${monthLabelVi(st.nextMonth)}`,
    message: isTroLy
      ? `Hạn ngày cuối tháng. Còn ${missing.length} thị trường chưa tải bảng giá: ${missing.join(", ")}.`
      : `Hạn ngày cuối tháng. Còn thiếu tỉ giá: ${missing.join(", ")}.`,
    userId: user.id,
    relatedId,
    relatedType: "Monthly",
  });
}
