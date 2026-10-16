import { requireOrchidPointPage } from "@/lib/orchid/page-guard";
import { OrchidPageHeader } from "@/components/orchid/shared";
import PointEntryDialog from "@/components/orchid/point-entry-dialog";
import { loadOrchidPointData, PointSummaryCards, PointActivityTables } from "@/components/orchid/point-detail";
import NoPointLinked from "../no-point";

export default async function OrchidPointStockPage() {
  const { point } = await requireOrchidPointPage();
  if (!point) return <NoPointLinked />;
  const data = await loadOrchidPointData(point.id);
  return (
    <div className="space-y-5">
      <OrchidPageHeader
        title="Báo số cây còn"
        description="Đếm số cây thực tế tại điểm và báo lại — hệ thống đối chiếu Nhận = Bán + Hỏng + Tồn"
        actions={<PointEntryDialog kind="stock" expectedStock={data.summary.expectedStock} />}
      />
      <PointSummaryCards data={data} />
      <PointActivityTables data={data} canDelete={false} sections={["reports"]} />
    </div>
  );
}
