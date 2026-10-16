import { requireOrchidPointPage } from "@/lib/orchid/page-guard";
import { OrchidPageHeader } from "@/components/orchid/shared";
import PointEntryDialog from "@/components/orchid/point-entry-dialog";
import { loadOrchidPointData, PointActivityTables } from "@/components/orchid/point-detail";
import NoPointLinked from "../no-point";

export default async function OrchidPointDamagePage() {
  const { point } = await requireOrchidPointPage();
  if (!point) return <NoPointLinked />;
  const data = await loadOrchidPointData(point.id);
  return (
    <div className="space-y-5">
      <OrchidPageHeader title="Báo cây hỏng / hao hụt" description="Nhập số lượng, ngày, lý do và chụp ảnh cây hỏng" actions={<PointEntryDialog kind="damage" />} />
      <PointActivityTables data={data} canDelete={false} sections={["damages"]} />
    </div>
  );
}
