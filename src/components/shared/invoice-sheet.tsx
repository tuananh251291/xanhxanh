import { customerFeeRows, fmtMoney, type InvoiceResult } from "@/lib/invoice-engine";

export type InvoiceSheetProfile = { name: string; address: string; email: string; phone: string | null; taxCode: string | null; bankInfo: string | null };

// Mặt invoice (tiếng Anh, gửi khách) — dùng cho xem trước khi lập, trang chi tiết và bản in / PDF.
// view "customer": Mỹ/Úc gộp phí ship 1 dòng; "internal": đủ chi tiết thùng, cảnh báo nội bộ.
export default function InvoiceSheet({
  invoiceNo, date, profile, customer, marketName, kind, result, view, provisional,
}: {
  invoiceNo: string; date: string; profile: InvoiceSheetProfile | null;
  customer: { name: string; address: string | null; email: string | null };
  marketName: string; kind: string; result: InvoiceResult; view: "customer" | "internal"; provisional?: boolean;
}) {
  const r = result, cur = r.currency;
  const feeRows = view === "customer" ? customerFeeRows(r, kind) : r.fees;
  return (
    <div className="invoice-sheet bg-card text-foreground text-sm border border-divider rounded-lg print:border-0 print:rounded-none">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 border-b border-divider">
        <div className="min-w-0">
          <p className="font-bold text-base">{profile?.name ?? "—"}</p>
          {profile && (
            <p className="text-xs text-text-secondary whitespace-pre-line">
              {profile.address}
              {"\n"}{profile.email}{profile.phone ? ` · ${profile.phone}` : ""}{profile.taxCode ? ` · Tax code ${profile.taxCode}` : ""}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-text-muted">Purchase Order</p>
          <p className="font-bold font-mono">{invoiceNo}</p>
          <p className="text-xs text-text-secondary">{date} · {marketName} · {cur}</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">Bill to</p>
          <p className="font-bold">{customer.name || "—"}</p>
          {customer.address && <p className="text-text-secondary whitespace-pre-line">{customer.address}</p>}
          {customer.email && <p className="text-text-secondary">{customer.email}</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-2 text-base font-bold">Code</th>
                <th className="text-left py-2 pr-2 text-base font-bold">Product</th>
                <th className="text-right py-2 pr-2 text-base font-bold">Qty</th>
                <th className="text-right py-2 pr-2 text-base font-bold">Unit price</th>
                <th className="text-right py-2 text-base font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {r.items.length === 0 ? (
                <tr><td colSpan={5} className="py-3 text-text-muted">No valid products yet.</td></tr>
              ) : r.items.map((i, k) => (
                <tr key={k} className="border-b border-divider align-top">
                  <td className="py-2 pr-2 font-mono text-xs">{i.code}</td>
                  <td className="py-2 pr-2">
                    {i.name}
                    <div className="text-xs text-text-muted">{i.spec}{i.sur ? ` · bag-1 surcharge ${fmtMoney(i.sur, cur)} × ${i.nBags}` : ""}</div>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{i.qty.toLocaleString("en-US")}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(i.unit, cur)}</td>
                  <td className="py-2 text-right tabular-nums">{fmtMoney(i.amount, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto max-w-md space-y-1">
          <div className="flex justify-between gap-4"><span>Goods subtotal{kind === "AU" ? " (EXW AUS)" : ""}</span><span className="tabular-nums">{fmtMoney(r.goods, cur)}</span></div>
          {feeRows.map((f, k) => (
            <div key={k} className={`flex justify-between gap-4 ${f.inTotal === false ? "text-text-muted" : ""}`}>
              <span>
                {f.label}{f.inTotal === false ? " — not included in total" : ""}
                {view === "internal" && f.detail && <span className="block text-xs text-text-muted">{f.detail}</span>}
              </span>
              <span className="tabular-nums">{fmtMoney(f.amount, cur)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t-2 border-foreground pt-1 text-base font-bold">
            <span>Total ({cur}){provisional ? " — provisional" : ""}</span><span className="tabular-nums">{fmtMoney(r.total, cur)}</span>
          </div>
        </div>
        {view === "internal" && r.boxNote && <p className="text-xs text-text-muted">Đóng thùng: {r.boxNote}</p>}
        {view === "internal" && r.warnings.length > 0 && (
          <ul className="text-xs rounded-md bg-warning-light text-warning-foreground px-4 py-2 list-disc pl-6 print:hidden">
            {r.warnings.map((w, k) => <li key={k}>{w}</li>)}
          </ul>
        )}
        {profile?.bankInfo && <p className="text-xs text-text-secondary whitespace-pre-line border-t border-divider pt-3">{profile.bankInfo}</p>}
      </div>
    </div>
  );
}
