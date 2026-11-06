import type { InvoiceResult } from "@/lib/invoice-engine";

// Bản nội bộ gửi QL Kho thành phẩm: chỉ thông tin hàng hoá để chuẩn bị đơn, KHÔNG có giá, phí, thông tin ngân hàng.
export default function InvoiceInternalSheet({ invoiceNo, orderCode, customerCode, shipDate, result }: {
  invoiceNo: string; orderCode: string | null; customerCode: string | null; shipDate: string | null; result: InvoiceResult;
}) {
  return (
    <div className="bg-card text-foreground text-sm border border-divider rounded-lg print:border-0 print:rounded-none p-5 space-y-4">
      <div className="border-b border-divider pb-3">
        <p className="font-bold text-lg">BẢN NỘI BỘ — CHUẨN BỊ HÀNG</p>
        <p className="text-xs text-text-secondary font-mono">{invoiceNo}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-3">
        <p><span className="block text-xs text-text-muted">Mã khách hàng</span><span className="font-bold font-mono">{customerCode ?? "—"}</span></p>
        <p><span className="block text-xs text-text-muted">Ngày xuất</span><span className="font-bold">{shipDate ?? "Chưa có"}</span></p>
        <p><span className="block text-xs text-text-muted">Mã đơn</span><span className="font-bold font-mono">{orderCode ?? "Chưa gắn đơn"}</span></p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-2 text-base font-bold">Mã</th>
              <th className="text-left py-2 pr-2 text-base font-bold">Sản phẩm</th>
              <th className="text-left py-2 pr-2 text-base font-bold">Quy cách</th>
              <th className="text-right py-2 pr-2 text-base font-bold">Số cây</th>
              <th className="text-right py-2 text-base font-bold">Số túi</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((i, k) => (
              <tr key={k} className="border-b border-divider align-top">
                <td className="py-2 pr-2 font-mono text-xs">{i.code}</td>
                <td className="py-2 pr-2">{i.name}</td>
                <td className="py-2 pr-2 text-text-secondary">{i.spec}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{i.qty.toLocaleString("vi-VN")}</td>
                <td className="py-2 text-right tabular-nums">{i.nBags > 0 ? i.nBags.toLocaleString("vi-VN") : "—"}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td colSpan={3} className="py-2 pr-2">Tổng số cây</td>
              <td className="py-2 pr-2 text-right tabular-nums">{result.items.reduce((s, i) => s + i.qty, 0).toLocaleString("vi-VN")}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
