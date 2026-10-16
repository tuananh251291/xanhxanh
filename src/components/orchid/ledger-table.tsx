import { formatVND, formatDateVN } from "@/lib/orchid/labels";
import { EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";

// Sổ công nợ theo giao dịch: Ngày | Nội dung | Phát sinh | Thanh toán | Còn nợ.
export default function LedgerTable({ entries, debitLabel = "Phát sinh", creditLabel = "Thanh toán" }: {
  entries: { date: Date; content: string; debit: number; credit: number; balance: number }[];
  debitLabel?: string;
  creditLabel?: string;
}) {
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-primary-light">
              <th className={TH}>Ngày</th>
              <th className={TH}>Nội dung</th>
              <th className={THR}>{debitLabel}</th>
              <th className={THR}>{creditLabel}</th>
              <th className={THR}>Còn nợ</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <EmptyRow colSpan={5} text="Chưa có giao dịch" />
            ) : (
              entries.map((e, i) => (
                <tr key={i} className={TR}>
                  <td className={TD}>{formatDateVN(e.date)}</td>
                  <td className={TD}>{e.content}</td>
                  <td className={TDR}>{e.debit ? formatVND(e.debit) : "—"}</td>
                  <td className={TDR}>{e.credit ? formatVND(e.credit) : "—"}</td>
                  <td className={`${TDR} font-semibold`}>{formatVND(e.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
