import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getAllOrchidSupplierDebts } from "@/lib/orchid/server";
import { formatVND, formatDateVN } from "@/lib/orchid/labels";
import { OrchidPageHeader, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import SupplierDialog from "./supplier-dialog";

export default async function OrchidSuppliersPage() {
  await requireOrchidStaffPage();
  const [suppliers, debts] = await Promise.all([
    prisma.orchidSupplier.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    getAllOrchidSupplierDebts(prisma),
  ]);

  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Nhà cung cấp" description={`${suppliers.length} nhà cung cấp · công nợ phát sinh theo phiếu nhập`} actions={<SupplierDialog />} />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Mã NCC</th>
                <th className={TH}>Tên</th>
                <th className={TH}>Liên hệ</th>
                <th className={THR}>Phải trả</th>
                <th className={THR}>Đã trả</th>
                <th className={THR}>Còn phải trả</th>
                <th className={TH}>Đến hạn</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <EmptyRow colSpan={8} text="Chưa có nhà cung cấp" />
              ) : (
                suppliers.map((s) => {
                  const d = debts.get(s.id);
                  return (
                    <tr key={s.id} className={TR}>
                      <td className={`${TD} font-mono text-info-foreground`}>{s.code}</td>
                      <td className={`${TD} font-medium`}>{s.name}</td>
                      <td className={TD}>
                        <div className="text-xs text-text-secondary">
                          {[s.contactName, s.phone].filter(Boolean).join(" · ") || "—"}
                          {s.address && <div>{s.address}</div>}
                        </div>
                      </td>
                      <td className={TDR}>{formatVND(d?.totalReceivable)}</td>
                      <td className={TDR}>{formatVND(d?.paid)}</td>
                      <td className={`${TDR} font-semibold ${d && d.overdue > 0 ? "text-destructive" : ""}`}>{formatVND(d?.outstanding)}</td>
                      <td className={TD}>
                        {d && d.overdue > 0 ? <span className="text-destructive text-xs">Quá hạn {formatVND(d.overdue)}</span> : formatDateVN(d?.nextDueDate)}
                      </td>
                      <td className={TD}>
                        <SupplierDialog item={s} />
                      </td>
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
