import { prisma } from "@/lib/prisma";
import { requireOrchidPointPage } from "@/lib/orchid/page-guard";
import { formatNumber, formatDateVN } from "@/lib/orchid/labels";
import { OrchidPageHeader, SectionTitle } from "@/components/orchid/shared";
import { Card, CardContent } from "@/components/ui/card";
import { loadOrchidPointData, PointActivityTables } from "@/components/orchid/point-detail";
import NoPointLinked from "../no-point";
import ReceiveForm from "./receive-form";

// Điểm bán chỉ thấy TỔNG số cây được giao (không thấy sản phẩm/lô của kho trung tâm).
export default async function OrchidPointReceivePage() {
  const { point } = await requireOrchidPointPage();
  if (!point) return <NoPointLinked />;
  const [pending, data] = await Promise.all([
    prisma.orchidTransfer.findMany({
      where: { pointId: point.id, type: "TO_POINT", status: "PENDING" },
      orderBy: { transferDate: "asc" },
      select: { id: true, code: true, transferDate: true, quantity: true, deliveredBy: true, note: true },
    }),
    loadOrchidPointData(point.id),
  ]);

  return (
    <div className="space-y-5">
      <OrchidPageHeader title="Nhận hàng" description="Xác nhận số cây thực nhận cho từng lần giao" />
      <section className="space-y-2">
        <SectionTitle>Hàng đang chờ nhận</SectionTitle>
        {pending.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-text-muted">Không có hàng đang chờ nhận</CardContent></Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {pending.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="font-mono text-sm">{t.code}</span>
                    <span className="text-sm text-text-secondary">{formatDateVN(t.transferDate)}</span>
                  </div>
                  <p className="text-2xl font-bold text-primary-strong">{formatNumber(t.quantity)} cây</p>
                  <p className="text-sm text-text-secondary">Người giao: {t.deliveredBy ?? "—"}{t.note ? ` · ${t.note}` : ""}</p>
                  <ReceiveForm transferId={t.id} quantity={t.quantity} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
      <PointActivityTables data={data} canDelete={false} sections={["transfers"]} />
    </div>
  );
}
