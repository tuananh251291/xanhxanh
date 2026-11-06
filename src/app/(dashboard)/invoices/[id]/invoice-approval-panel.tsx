import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney, type InvoiceApprovalSummary } from "@/lib/invoice-engine";

// Phần Admin cấp cao xem trước khi duyệt: mã nào xin giá nào, so với giá gốc trong bảng giá của phiếu.
export default function InvoiceApprovalPanel({ summary: s, actions }: { summary: InvoiceApprovalSummary; actions?: React.ReactNode }) {
  const cur = s.currency;
  const money = (v: number | null) => (v === null ? "—" : fmtMoney(v, cur));
  const pct = s.goodsAtBase > 0 ? Math.round((Math.abs(s.decrease) / s.goodsAtBase) * 1000) / 10 : null;
  return (
    <Card className="print:hidden">
      <CardHeader><CardTitle>Chi tiết xin duyệt giá ({s.lines.length} dòng)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-divider">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                {["Mã", "Sản phẩm", "Quy cách"].map((h) => <th key={h} className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">{h}</th>)}
                {["SL xin duyệt", "Giá gốc/cây", "Giá xin duyệt/cây", "Tiền chênh"].map((h) => <th key={h} className="text-right px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l, k) => (
                <tr key={k} className="border-b border-divider last:border-0 align-top">
                  <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                  <td className="px-3 py-2">{l.name}</td>
                  <td className="px-3 py-2 text-text-secondary">{l.spec}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.qty.toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {money(l.basePrice)}
                    {l.note && <span className="block text-xs text-warning-foreground">{l.note}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap">{money(l.proposedPrice)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${(l.diffAmount ?? 0) > 0 ? "text-destructive" : ""}`}>
                    {l.diffAmount === null ? "—" : `${l.diffAmount > 0 ? "−" : l.diffAmount < 0 ? "+" : ""}${fmtMoney(Math.abs(l.diffAmount), cur)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto max-w-md space-y-1 text-sm">
          <div className="flex justify-between gap-4"><span>Tiền hàng theo giá gốc</span><span className="tabular-nums">{fmtMoney(s.goodsAtBase, cur)}</span></div>
          <div className="flex justify-between gap-4"><span>Tiền hàng theo giá xin duyệt</span><span className="tabular-nums">{fmtMoney(s.goodsProposed, cur)}</span></div>
          <div className="flex justify-between gap-4 border-t border-border pt-1 text-base font-bold">
            <span>{s.decrease >= 0 ? "Tổng đơn giảm" : "Tổng đơn tăng"}</span>
            <span className="tabular-nums">{fmtMoney(Math.abs(s.decrease), cur)}{pct !== null ? ` (${pct}%)` : ""}</span>
          </div>
          {s.unpricedCount > 0 && <p className="text-xs text-warning-foreground">{s.unpricedCount} dòng không có giá gốc nên chưa tính vào phần chênh.</p>}
          <p className="text-xs text-text-muted">Chỉ so tiền hàng, chưa gồm phí vận chuyển, thuế và phụ thu.</p>
        </div>
        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </CardContent>
    </Card>
  );
}
