import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Settings, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canApproveInvoice, canCreateInvoice, canEditUsShipments, canViewAllInvoices } from "@/lib/invoice";
import { isPageAllowed } from "@/lib/permissions";
import InvoiceList from "./invoice-list";

export default async function InvoicesPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(canCreateInvoice(role) || canViewAllInvoices(role)) || !(await isPageAllowed(role, "/invoices"))) redirect("/dashboard");
  const shipments = await canEditUsShipments(session.user);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Wallet className="w-6 h-6 text-primary-strong" /> Invoice</h1>
          <p className="text-text-secondary text-sm mt-1">Báo giá độc lập hoặc gắn đơn đang giữ. Đơn hàng cần invoice đã duyệt mới xác nhận được.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shipments && (
            <Link href="/invoice-settings"><Button variant="outline"><Settings className="w-4 h-4 mr-1.5" /> {role === "SUPER_ADMIN" ? "Cài đặt invoice" : "Lịch chuyến Mỹ"}</Button></Link>
          )}
          {canCreateInvoice(role) && <Link href="/invoices/new"><Button><Plus className="w-4 h-4 mr-1.5" /> Lập invoice</Button></Link>}
        </div>
      </div>
      <InvoiceList canApprove={canApproveInvoice(role)} />
    </div>
  );
}
