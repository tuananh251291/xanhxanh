import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidAccountOptions } from "@/lib/orchid/queries";
import { formatDateVN, ORCHID_POINT_STATUS_LABELS } from "@/lib/orchid/labels";
import { OrchidPageHeader } from "@/components/orchid/shared";
import { Button } from "@/components/ui/button";
import PaymentDialog from "@/components/orchid/payment-dialog";
import PointEntryDialog from "@/components/orchid/point-entry-dialog";
import { loadOrchidPointData, PointSummaryCards, PointActivityTables } from "@/components/orchid/point-detail";
import PointDialog from "../point-dialog";

export default async function OrchidRetailPointDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrchidStaffPage();
  const { id } = await params;
  const point = await prisma.orchidRetailPoint.findUnique({ where: { id }, include: { user: { select: { email: true } } } });
  if (!point) notFound();
  const [data, accounts] = await Promise.all([loadOrchidPointData(id), getOrchidAccountOptions()]);

  return (
    <div className="space-y-5">
      <OrchidPageHeader
        title={point.name}
        description={`${point.code} · ${point.address ?? "—"} · Phụ trách: ${point.managerName ?? "—"} (${point.phone ?? "—"}) · Bắt đầu ${formatDateVN(point.startDate)} · ${ORCHID_POINT_STATUS_LABELS[point.status]}${point.user ? ` · Tài khoản: ${point.user.email}` : ""}`}
        actions={
          <>
            <PointDialog
              item={{
                id: point.id, code: point.code, name: point.name, address: point.address, managerName: point.managerName, phone: point.phone,
                startDate: point.startDate?.toISOString() ?? null, status: point.status, note: point.note, loginEmail: point.user?.email ?? null,
              }}
            />
            <Link href={`/orchid/transfers?pointId=${point.id}`}><Button variant="outline" size="sm">Gửi / nhận hàng</Button></Link>
            <PointEntryDialog kind="sale" pointId={point.id} triggerLabel="Nhập bán" />
            <PointEntryDialog kind="damage" pointId={point.id} triggerLabel="Nhập hỏng" />
            <PointEntryDialog kind="stock" pointId={point.id} triggerLabel="Nhập tồn" expectedStock={data.summary.expectedStock} />
            <PaymentDialog kind="point" targetId={point.id} targetName={point.name} accounts={accounts} size="sm" triggerLabel="Điểm nộp tiền" defaultAmount={Math.max(0, Math.round(data.summary.debt)) || undefined} />
          </>
        }
      />
      <PointSummaryCards data={data} />
      <PointActivityTables data={data} canDelete />
    </div>
  );
}
