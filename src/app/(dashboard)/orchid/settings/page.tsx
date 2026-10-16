import { prisma } from "@/lib/prisma";
import type { OrchidExpenseGroup } from "@prisma/client";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { ORCHID_EXPENSE_GROUP_LABELS, ORCHID_PAYMENT_METHOD_LABELS } from "@/lib/orchid/labels";
import { OrchidPageHeader, SectionTitle, EmptyRow } from "@/components/orchid/shared";
import { TH, TD, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccountDialog, WarehouseDialog, CategoryDialog } from "./setting-dialogs";

export default async function OrchidSettingsPage() {
  await requireOrchidStaffPage(true);
  const [accounts, warehouses, categories] = await Promise.all([
    prisma.orchidPaymentAccount.findMany({ orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }] }),
    prisma.orchidWarehouse.findMany({ orderBy: { code: "asc" } }),
    prisma.orchidExpenseCategory.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }] }),
  ]);
  const inactive = (active: boolean) => (!active ? <Badge variant="outline" className="ml-1">Ngừng dùng</Badge> : null);

  return (
    <div className="space-y-6">
      <OrchidPageHeader title="Cấu hình Dự án hoa lan" description="Tài khoản nhận/chi tiền, kho hàng, loại chi phí. Người dùng (Admin/Trợ lý) quản lý ở mục Quản lý người dùng." />

      <section className="space-y-2">
        <div className="flex items-center justify-between"><SectionTitle>Tài khoản nhận / chi tiền</SectionTitle><AccountDialog /></div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-primary-light"><th className={TH}>Tên</th><th className={TH}>Loại</th><th className={TH}>Ngân hàng / Số TK / Chủ TK</th><th className={TH}>Ghi chú</th><th className={TH}></th></tr></thead>
              <tbody>
                {accounts.length === 0 ? <EmptyRow colSpan={5} /> : accounts.map((a) => (
                  <tr key={a.id} className={TR}>
                    <td className={`${TD} font-medium`}>{a.name}{inactive(a.isActive)}</td>
                    <td className={TD}>{ORCHID_PAYMENT_METHOD_LABELS[a.type]}</td>
                    <td className={TD}>{[a.bankName, a.accountNumber, a.accountHolder].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={TD}>{a.note ?? ""}</td>
                    <td className={TD}><AccountDialog item={a} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><SectionTitle>Kho hàng</SectionTitle><WarehouseDialog /></div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-primary-light"><th className={TH}>Mã</th><th className={TH}>Tên kho</th><th className={TH}>Địa chỉ</th><th className={TH}></th></tr></thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id} className={TR}>
                    <td className={`${TD} font-mono`}>{w.code}</td>
                    <td className={`${TD} font-medium`}>{w.name}{inactive(w.isActive)}</td>
                    <td className={TD}>{w.address ?? "—"}</td>
                    <td className={TD}><WarehouseDialog item={w} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><SectionTitle>Loại chi phí</SectionTitle><CategoryDialog /></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(ORCHID_EXPENSE_GROUP_LABELS) as OrchidExpenseGroup[]).map((g) => (
            <Card key={g}>
              <CardContent className="p-3 space-y-1">
                <p className="font-semibold text-primary-strong">{ORCHID_EXPENSE_GROUP_LABELS[g]}</p>
                {categories.filter((c) => c.group === g).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span>{c.name}{inactive(c.isActive)}</span>
                    <CategoryDialog item={c} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
