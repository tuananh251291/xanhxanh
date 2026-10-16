import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getAllOrchidCustomerDebts } from "@/lib/orchid/server";
import { formatVND } from "@/lib/orchid/labels";
import { OrchidPageHeader, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CustomerDialog from "./customer-dialog";
import { getOrchidProductOptions } from "@/lib/orchid/queries";

export default async function OrchidCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOrchidStaffPage();
  const { q } = await searchParams;
  const [customers, debts, products] = await Promise.all([
    prisma.orchidCustomer.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {},
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      include: { user: { select: { email: true } }, prices: { select: { productId: true, price: true } } },
    }),
    getAllOrchidCustomerDebts(prisma),
    getOrchidProductOptions(),
  ]);

  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Khách hàng lan" description={`${customers.length} khách hàng (khác với khách mua cây mô)`} actions={<CustomerDialog products={products} />} />
      <form className="flex gap-2 max-w-md">
        <input name="q" defaultValue={q} placeholder="Tìm theo tên, mã, số điện thoại…" className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm" />
        <button className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-primary-light">Tìm</button>
      </form>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Khách hàng</th>
                <th className={TH}>Liên hệ</th>
                <th className={TH}>Tài khoản</th>
                <th className={THR}>Còn nợ</th>
                <th className={THR}>Quá hạn</th>
                <th className={THR}>Hạn mức</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <EmptyRow colSpan={7} text="Chưa có khách hàng" />
              ) : (
                customers.map((c) => {
                  const d = debts.get(c.id);
                  return (
                    <tr key={c.id} className={TR}>
                      <td className={TD}>
                        <Link href={`/orchid/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                        <div className="text-xs font-mono text-info-foreground">{c.code}</div>
                        {!c.isActive && <Badge variant="overdue" className="mt-1">Ngừng giao dịch</Badge>}
                      </td>
                      <td className={TD}><div className="text-xs text-text-secondary">{c.phone ?? "—"}{c.address && <div>{c.address}</div>}</div></td>
                      <td className={TD}>{c.user ? <Badge variant="completed">{c.user.email}</Badge> : <Badge variant="outline">Chưa cấp</Badge>}</td>
                      <td className={`${TDR} font-semibold`}>{formatVND(d?.outstanding)}</td>
                      <td className={`${TDR} ${d && d.overdue > 0 ? "text-destructive font-semibold" : ""}`}>{formatVND(d?.overdue)}</td>
                      <td className={TDR}>{c.creditLimit == null ? "—" : formatVND(c.creditLimit)}</td>
                      <td className={TD}>
                        <CustomerDialog
                          products={products}
                          item={{
                            id: c.id, code: c.code, name: c.name, phone: c.phone, email: c.email, address: c.address,
                            creditLimit: c.creditLimit, paymentTermDays: c.paymentTermDays, companyName: c.companyName, taxCode: c.taxCode,
                            invoiceAddress: c.invoiceAddress, invoiceEmail: c.invoiceEmail, note: c.note, isActive: c.isActive,
                            loginEmail: c.user?.email ?? null, prices: c.prices,
                          }}
                        />
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
