import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/invoice-engine";
import { ORDER_PRICE_ISSUE_LABELS, type OrderPriceSummary } from "@/lib/order-price-engine";
import { dateKeyLabelVi } from "@/lib/price-list-shared";

// Bảng giá của đơn: xem trước lúc tạo đơn (preview) và chi tiết đơn. Đơn giá chưa gồm phụ thu/ship — các khoản đó ở Phiếu báo giá.
export default function OrderPriceTable({ summary, preview = false }: { summary: OrderPriceSummary; preview?: boolean }) {
  const cur = summary.currency ?? "USD";
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-bold text-primary-strong">
        {preview ? "Giá dự kiến" : "Giá đơn hàng"}
        <span className="ml-2 text-xs font-normal text-text-secondary">
          {summary.effectiveFrom ? `Bảng giá áp dụng từ ${dateKeyLabelVi(summary.effectiveFrom)} · chưa gồm phụ thu, ship` : "Chưa có bảng giá đã duyệt"}
        </span>
      </p>
      <div className="border border-divider rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-light">
              <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
              <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
              <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Số cây</th>
              <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Bậc</th>
              <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Đơn giá</th>
              <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {summary.lines.map((l) => (
              <tr key={`${l.plantTypeCode}:${l.stageCode}`} className="border-t border-divider">
                <td className="px-3 py-1.5" title={l.plantTypeName}><span className="font-mono">{l.plantTypeCode}</span></td>
                <td className="px-3 py-1.5">{l.stageCode}</td>
                <td className="px-3 py-1.5 text-right">{l.quantity.toLocaleString("vi-VN")}</td>
                <td className="px-3 py-1.5 text-text-secondary">{l.manual ? "Giá tay đã duyệt" : l.tier ?? "—"}</td>
                {l.issue ? (
                  <td className="px-3 py-1.5 text-right" colSpan={2}><Badge variant="overdue">{ORDER_PRICE_ISSUE_LABELS[l.issue]} — cần giá tay</Badge></td>
                ) : (
                  <>
                    <td className="px-3 py-1.5 text-right">{fmtMoney(l.unitPrice, cur)}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{fmtMoney(l.amount, cur)}</td>
                  </>
                )}
              </tr>
            ))}
            <tr className="border-t border-border">
              <td className="px-3 py-2 text-right font-bold text-primary-strong" colSpan={5}>Tổng tiền hàng{summary.issueCount > 0 ? " (chưa gồm dòng chưa có giá)" : ""}</td>
              <td className="px-3 py-2 text-right font-bold text-primary-strong">{fmtMoney(summary.total, cur)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {summary.issueCount > 0 && (
        <p className="text-xs text-warning-foreground bg-warning-light rounded-md px-3 py-2">
          Vẫn giữ hàng được. Dòng chưa có giá cần nhập giá tay ở Phiếu báo giá gắn đơn và được Admin cấp cao duyệt thì mới xác nhận đơn được.
        </p>
      )}
    </div>
  );
}
