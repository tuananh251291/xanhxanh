import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { canCreateInvoice } from "@/lib/invoice";
import { isPageAllowed } from "@/lib/permissions";
import InvoiceForm from "../invoice-form";
import { loadInvoiceFormData, vnToday } from "../form-data";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !canCreateInvoice(role) || !(await isPageAllowed(role, "/invoices"))) redirect("/dashboard");
  const { orderId } = await searchParams;
  const data = await loadInvoiceFormData(session.user);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/invoices" className="text-sm text-text-secondary inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Danh sách invoice</Link>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 mt-1"><Wallet className="w-6 h-6 text-primary-strong" /> Lập invoice</h1>
        <p className="text-text-secondary text-sm mt-1">Giá lấy theo bảng giá tháng đã duyệt của thị trường; phí ship/thuế theo Cài đặt invoice. Giá nhập tay cần Admin cấp cao duyệt.</p>
      </div>
      <InvoiceForm {...data} today={vnToday()} initial={null} presetOrderId={orderId ?? null} />
    </div>
  );
}
