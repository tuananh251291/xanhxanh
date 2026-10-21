import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

// Nút Invoice ở đơn đang giữ: chưa có invoice → lập mới gắn đơn; có rồi → mở xem (kèm trạng thái duyệt).
// Đơn cần invoice đã duyệt mới Xác nhận được (xem confirmOrder, PATCH /api/orders/[id]).
export default function OrderInvoiceLink({ orderId, invoice }: { orderId: string; invoice: { id: string; invoiceNo: string; status: string } | null }) {
  if (!invoice) {
    return (
      <Link href={`/invoices/new?orderId=${orderId}`}>
        <Button size="sm" variant="outline" className="h-8"><FileText className="w-3.5 h-3.5 mr-1.5" /> Lập phiếu báo giá</Button>
      </Link>
    );
  }
  const label = invoice.status === "APPROVED" ? "" : invoice.status === "PENDING_APPROVAL" ? " (chờ duyệt)" : " (bị từ chối)";
  return (
    <Link href={`/invoices/${invoice.id}`}>
      <Button size="sm" variant="outline" className="h-8"><FileText className="w-3.5 h-3.5 mr-1.5" /> {invoice.invoiceNo}{label}</Button>
    </Link>
  );
}
