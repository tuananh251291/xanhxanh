import { requireOrchidPointPage } from "@/lib/orchid/page-guard";
import { formatVND, formatNumber, formatDateVN } from "@/lib/orchid/labels";
import { OrchidPageHeader, SectionTitle, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { loadOrchidPointData, PointSummaryCards, PointActivityTables } from "@/components/orchid/point-detail";
import NoPointLinked from "./no-point";

// Tổng quan điểm bán — chỉ số liệu của chính điểm (không thấy tồn kho trung tâm).
export default async function OrchidPointHomePage() {
  const { point } = await requireOrchidPointPage();
  if (!point) return <NoPointLinked />;
  const data = await loadOrchidPointData(point.id);

  const byDay = new Map<string, { qty: number; revenue: number }>();
  for (const s of data.sales) {
    const k = s.saleDate.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const r = byDay.get(k) ?? { qty: 0, revenue: 0 };
    r.qty += s.quantity;
    r.revenue += s.revenue;
    byDay.set(k, r);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 31);

  return (
    <div className="space-y-5">
      <OrchidPageHeader title={point.name} description={`${point.code} · ${point.address ?? ""}`} />
      <PointSummaryCards data={data} />
      <section className="space-y-2">
        <SectionTitle>Doanh thu theo ngày</SectionTitle>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-primary-light"><th className={TH}>Ngày</th><th className={THR}>Số cây bán</th><th className={THR}>Doanh thu</th></tr></thead>
              <tbody>
                {days.length === 0 ? <EmptyRow colSpan={3} text="Chưa có bán hàng" /> : days.map(([d, r]) => (
                  <tr key={d} className={TR}>
                    <td className={TD}>{formatDateVN(new Date(`${d}T00:00:00+07:00`))}</td>
                    <td className={TDR}>{formatNumber(r.qty)}</td>
                    <td className={TDR}>{formatVND(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
      <PointActivityTables data={data} canDelete={false} sections={["payments", "transfers"]} />
    </div>
  );
}
