import { prisma } from "@/lib/prisma";
import { getOrchidPointSummaries } from "@/lib/orchid/server";
import {
  formatVND,
  formatNumber,
  formatDateVN,
  ORCHID_DAMAGE_REASON_LABELS,
  ORCHID_TRANSFER_STATUS_LABELS,
  ORCHID_TRANSFER_TYPE_LABELS,
  ORCHID_PAYMENT_METHOD_LABELS,
} from "@/lib/orchid/labels";
import { StatCard, SectionTitle, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DeleteEntryButton from "@/components/orchid/delete-entry-button";

export async function loadOrchidPointData(pointId: string) {
  const [summaries, transfers, sales, damages, reports, payments] = await Promise.all([
    getOrchidPointSummaries(prisma, [pointId]),
    prisma.orchidTransfer.findMany({ where: { pointId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.orchidRetailSale.findMany({ where: { pointId }, orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }], take: 300 }),
    prisma.orchidRetailDamage.findMany({ where: { pointId }, orderBy: [{ damageDate: "desc" }, { createdAt: "desc" }], take: 300 }),
    prisma.orchidRetailStockReport.findMany({ where: { pointId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.orchidRetailPayment.findMany({ where: { pointId }, orderBy: { paymentDate: "desc" }, take: 200, include: { account: { select: { name: true } } } }),
  ]);
  return { summary: summaries.get(pointId)!, transfers, sales, damages, reports, payments };
}
export type OrchidPointData = Awaited<ReturnType<typeof loadOrchidPointData>>;

// Thẻ tổng hợp: Nhận = Bán + Hỏng + Tồn (+ Trả về kho). Không bao giờ hiện chi tiết tồn kho trung tâm.
export function PointSummaryCards({ data }: { data: OrchidPointData }) {
  const s = data.summary;
  const balanced = s.received === s.sold + s.damaged + s.expectedStock + s.returned;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard label="Đã nhận" value={formatNumber(s.received)} sub={s.pendingIncoming > 0 ? `Đang gửi tới: ${s.pendingIncoming}` : undefined} />
        <StatCard label="Đã bán" value={formatNumber(s.sold)} tone="primary" />
        <StatCard label="Hỏng" value={formatNumber(s.damaged)} sub={s.received > 0 ? `Tỷ lệ ${((s.damaged / s.received) * 100).toFixed(1)}%` : undefined} tone="danger" />
        <StatCard label="Tồn (sổ sách)" value={formatNumber(s.expectedStock)} sub={s.returned > 0 ? `Đã trả về kho ${s.returned}` : undefined} />
        <StatCard label="Doanh thu" value={formatVND(s.revenue)} tone="primary" />
        <StatCard label="Công nợ (chưa nộp)" value={formatVND(s.debt)} sub={`Đã nộp ${formatVND(s.paid)}`} tone={s.debt > 0.5 ? "warning" : "default"} />
      </div>
      <Card className={s.mismatch ? "border-destructive" : undefined}>
        <CardContent className="p-4 text-sm">
          <p>
            Kiểm tra: Nhận <b>{s.received}</b> = Bán <b>{s.sold}</b> + Hỏng <b>{s.damaged}</b> + Tồn <b>{s.expectedStock}</b>
            {s.returned > 0 && <> + Trả về kho <b>{s.returned}</b></>} {balanced ? "✓" : ""}
          </p>
          {s.lastReport ? (
            s.mismatch ? (
              <p className="text-destructive font-semibold mt-1">
                Cảnh báo lệch: lần báo tồn ngày {formatDateVN(s.lastReport.reportDate)} điểm báo còn {s.lastReport.remainingQuantity} cây, sổ sách lúc đó là {s.lastReport.expectedAtReport} cây (lệch{" "}
                {s.lastReport.remainingQuantity - s.lastReport.expectedAtReport}).
              </p>
            ) : (
              <p className="text-primary-strong mt-1">Lần báo tồn gần nhất ({formatDateVN(s.lastReport.reportDate)}): {s.lastReport.remainingQuantity} cây — khớp sổ sách.</p>
            )
          ) : (
            <p className="text-text-muted mt-1">Điểm bán chưa báo số cây còn lần nào.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type Section = "sales" | "damages" | "reports" | "payments" | "transfers";
const ALL_SECTIONS: Section[] = ["sales", "damages", "reports", "payments", "transfers"];

export function PointActivityTables({ data, canDelete, sections = ALL_SECTIONS }: { data: OrchidPointData; canDelete: boolean; sections?: Section[] }) {
  const show = (s: Section) => sections.includes(s);
  return (
    <div className="space-y-5">
      {show("sales") && <section className="space-y-2">
        <SectionTitle>Bán hàng</SectionTitle>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className={TH}>Ngày</th>
                  <th className={THR}>Số cây bán</th>
                  <th className={THR}>Doanh thu</th>
                  <th className={TH}>Số hoá đơn</th>
                  <th className={TH}>Ghi chú</th>
                  <th className={TH}>Người nhập</th>
                  {canDelete && <th className={TH}></th>}
                </tr>
              </thead>
              <tbody>
                {data.sales.length === 0 ? (
                  <EmptyRow colSpan={canDelete ? 7 : 6} />
                ) : (
                  data.sales.map((s) => (
                    <tr key={s.id} className={TR}>
                      <td className={TD}>{formatDateVN(s.saleDate)}</td>
                      <td className={TDR}>{formatNumber(s.quantity)}</td>
                      <td className={TDR}>{formatVND(s.revenue)}</td>
                      <td className={TD}>{s.invoiceNumber ?? "—"}</td>
                      <td className={TD}>{s.note ?? ""}</td>
                      <td className={TD}>{s.createdByName}</td>
                      {canDelete && <td className={TD}><DeleteEntryButton id={s.id} kind="sale" /></td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>}

      {show("damages") && <section className="space-y-2">
        <SectionTitle>Cây hỏng / hao hụt</SectionTitle>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className={TH}>Ngày</th>
                  <th className={THR}>Số lượng</th>
                  <th className={TH}>Lý do</th>
                  <th className={TH}>Hình ảnh</th>
                  <th className={TH}>Ghi chú</th>
                  {canDelete && <th className={TH}></th>}
                </tr>
              </thead>
              <tbody>
                {data.damages.length === 0 ? (
                  <EmptyRow colSpan={canDelete ? 6 : 5} />
                ) : (
                  data.damages.map((d) => (
                    <tr key={d.id} className={TR}>
                      <td className={TD}>{formatDateVN(d.damageDate)}</td>
                      <td className={TDR}>{formatNumber(d.quantity)}</td>
                      <td className={TD}>{ORCHID_DAMAGE_REASON_LABELS[d.reason]}</td>
                      <td className={TD}>
                        <div className="flex gap-1">
                          {d.photoUrls.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={u} alt="" className="w-10 h-10 rounded object-cover border border-divider" />
                            </a>
                          ))}
                        </div>
                      </td>
                      <td className={TD}>{d.note ?? ""}</td>
                      {canDelete && <td className={TD}><DeleteEntryButton id={d.id} kind="damage" /></td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>}

      <div className="grid lg:grid-cols-2 gap-5">
        {show("reports") && <section className="space-y-2">
          <SectionTitle>Báo số cây còn</SectionTitle>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-primary-light">
                    <th className={TH}>Ngày</th>
                    <th className={THR}>Còn</th>
                    <th className={TH}>Ghi chú</th>
                    {canDelete && <th className={TH}></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.reports.length === 0 ? (
                    <EmptyRow colSpan={canDelete ? 4 : 3} />
                  ) : (
                    data.reports.map((r) => (
                      <tr key={r.id} className={TR}>
                        <td className={TD}>{formatDateVN(r.reportDate)}</td>
                        <td className={TDR}>{formatNumber(r.remainingQuantity)}</td>
                        <td className={TD}>{r.note ?? ""}</td>
                        {canDelete && <td className={TD}><DeleteEntryButton id={r.id} kind="stock" /></td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>}
        {show("payments") && <section className="space-y-2">
          <SectionTitle>Nộp tiền về</SectionTitle>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-primary-light">
                    <th className={TH}>Ngày</th>
                    <th className={TH}>Hình thức</th>
                    <th className={THR}>Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.length === 0 ? (
                    <EmptyRow colSpan={3} />
                  ) : (
                    data.payments.map((p) => (
                      <tr key={p.id} className={TR}>
                        <td className={TD}>{formatDateVN(p.paymentDate)}</td>
                        <td className={TD}>{ORCHID_PAYMENT_METHOD_LABELS[p.method]}{p.account && <div className="text-xs text-text-muted">{p.account.name}</div>}</td>
                        <td className={TDR}>{formatVND(p.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>}
      </div>

      {show("transfers") && (
        <section className="space-y-2">
          <SectionTitle>Lịch sử hàng gửi / trả</SectionTitle>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-primary-light">
                    <th className={TH}>Mã phiếu</th>
                    <th className={TH}>Ngày</th>
                    <th className={TH}>Loại</th>
                    <th className={THR}>Số lượng</th>
                    <th className={THR}>Thực nhận</th>
                    <th className={TH}>Người giao / nhận</th>
                    <th className={TH}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transfers.length === 0 ? (
                    <EmptyRow colSpan={7} />
                  ) : (
                    data.transfers.map((t) => (
                      <tr key={t.id} className={TR}>
                        <td className={`${TD} font-mono`}>{t.code}</td>
                        <td className={TD}>{formatDateVN(t.transferDate)}</td>
                        <td className={TD}>{ORCHID_TRANSFER_TYPE_LABELS[t.type]}</td>
                        <td className={TDR}>{formatNumber(t.quantity)}</td>
                        <td className={TDR}>{t.receivedQuantity ?? "—"}</td>
                        <td className={TD}>{t.deliveredBy ?? "—"} / {t.receivedBy ?? "—"}{t.note && <div className="text-xs text-text-muted">{t.note}</div>}</td>
                        <td className={TD}>
                          <Badge variant={t.status === "RECEIVED" ? "completed" : t.status === "PENDING" ? "in-progress" : "overdue"}>{ORCHID_TRANSFER_STATUS_LABELS[t.status]}</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
