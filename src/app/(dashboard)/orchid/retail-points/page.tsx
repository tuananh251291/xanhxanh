import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidPointSummaries } from "@/lib/orchid/server";
import { formatVND, formatNumber, ORCHID_POINT_STATUS_LABELS } from "@/lib/orchid/labels";
import { OrchidPageHeader, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PointDialog from "./point-dialog";

export default async function OrchidRetailPointsPage() {
  await requireOrchidStaffPage();
  const [points, summaries] = await Promise.all([
    prisma.orchidRetailPoint.findMany({ orderBy: [{ status: "asc" }, { code: "asc" }], include: { user: { select: { email: true } } } }),
    getOrchidPointSummaries(prisma),
  ]);

  return (
    <div className="space-y-4">
      <OrchidPageHeader
        title="Điểm bán lẻ"
        description="Chỉ theo dõi tổng số cây tại điểm (không theo lô): Nhận = Bán + Hỏng + Tồn"
        actions={<PointDialog />}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Điểm bán</th>
                <th className={THR}>Nhận</th>
                <th className={THR}>Bán</th>
                <th className={THR}>Hỏng</th>
                <th className={THR}>Trả về kho</th>
                <th className={THR}>Tồn (sổ sách)</th>
                <th className={TH}>Kiểm tra</th>
                <th className={THR}>Doanh thu</th>
                <th className={THR}>Công nợ điểm</th>
              </tr>
            </thead>
            <tbody>
              {points.length === 0 ? (
                <EmptyRow colSpan={9} text="Chưa có điểm bán" />
              ) : (
                points.map((p) => {
                  const s = summaries.get(p.id);
                  return (
                    <tr key={p.id} className={TR}>
                      <td className={TD}>
                        <Link href={`/orchid/retail-points/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                        <div className="text-xs text-text-muted">{p.code} · {p.managerName ?? "—"} · {p.phone ?? "—"}</div>
                        <div className="flex gap-1 mt-0.5">
                          {p.status !== "ACTIVE" && <Badge variant="outline">{ORCHID_POINT_STATUS_LABELS[p.status]}</Badge>}
                          {!p.user && <Badge variant="outline">Chưa có tài khoản</Badge>}
                          {s && s.pendingIncoming > 0 && <Badge variant="in-progress">Đang gửi {s.pendingIncoming}</Badge>}
                        </div>
                      </td>
                      <td className={TDR}>{formatNumber(s?.received)}</td>
                      <td className={TDR}>{formatNumber(s?.sold)}</td>
                      <td className={TDR}>{formatNumber(s?.damaged)}</td>
                      <td className={TDR}>{formatNumber(s?.returned)}</td>
                      <td className={`${TDR} font-semibold`}>{formatNumber(s?.expectedStock)}</td>
                      <td className={TD}>
                        {!s?.lastReport ? (
                          <span className="text-xs text-text-muted">Chưa báo tồn</span>
                        ) : s.mismatch ? (
                          <Badge variant="overdue">Lệch: báo {s.lastReport.remainingQuantity} / sổ {s.lastReport.expectedAtReport}</Badge>
                        ) : (
                          <Badge variant="completed">Khớp</Badge>
                        )}
                      </td>
                      <td className={TDR}>{formatVND(s?.revenue)}</td>
                      <td className={`${TDR} ${s && s.debt > 0.5 ? "text-warning-foreground font-semibold" : ""}`}>{formatVND(s?.debt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
