import { requireOrchidPointPage } from "@/lib/orchid/page-guard";
import { formatVND } from "@/lib/orchid/labels";
import { OrchidPageHeader, StatCard } from "@/components/orchid/shared";
import PointEntryDialog from "@/components/orchid/point-entry-dialog";
import { loadOrchidPointData, PointActivityTables } from "@/components/orchid/point-detail";
import NoPointLinked from "../no-point";

export default async function OrchidPointSalesPage() {
  const { point } = await requireOrchidPointPage();
  if (!point) return <NoPointLinked />;
  const data = await loadOrchidPointData(point.id);
  const s = data.summary;
  return (
    <div className="space-y-5">
      <OrchidPageHeader title="Bán hàng & doanh thu" description="Chỉ cần nhập: ngày, số cây bán, doanh thu, số hoá đơn" actions={<PointEntryDialog kind="sale" />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Tổng số cây đã bán" value={s.sold} tone="primary" />
        <StatCard label="Tổng doanh thu" value={formatVND(s.revenue)} tone="primary" />
        <StatCard label="Đã nộp về" value={formatVND(s.paid)} tone="info" />
        <StatCard label="Công nợ (chưa nộp)" value={formatVND(s.debt)} tone={s.debt > 0.5 ? "warning" : "default"} />
      </div>
      <PointActivityTables data={data} canDelete={false} sections={["sales", "payments"]} />
    </div>
  );
}
