import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { isPageAllowed } from "@/lib/permissions";
import { MARKET_LABELS } from "@/types";
import { getCustomerManager } from "@/lib/customer-manager";
import { PrintButton } from "@/components/shared/print-button";
import "./print-order.css";

const BLANK = "………………";

type PrintRow = { plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number; notes: string };

// Gộp OrderItem theo (loại cây, quy cách) cho phiếu in — không hiện riêng từng lô đã bị tách kỹ thuật
// lúc giữ đơn (khách/kho chỉ cần biết tổng số lượng theo đúng mã cây + quy cách).
function groupForPrint(
  items: { quantity: number; notes: string | null; lot: { plantTypeId: string; stageCode: string; plantType: { code: string; name: string } } }[]
): PrintRow[] {
  const byKey = new Map<string, PrintRow>();
  for (const item of items) {
    const key = `${item.lot.plantTypeId}::${item.lot.stageCode}`;
    const row = byKey.get(key) ?? {
      plantTypeCode: item.lot.plantType.code, plantTypeName: item.lot.plantType.name,
      stageCode: item.lot.stageCode, quantity: 0, notes: "",
    };
    row.quantity += item.quantity;
    if (item.notes && !row.notes.split("; ").includes(item.notes)) {
      row.notes = row.notes ? `${row.notes}; ${item.notes}` : item.notes;
    }
    byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

export default async function OrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/orders/list"))) redirect("/dashboard");

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      sale: { select: { name: true } },
      customer: { select: { marketId: true } },
      items: { include: { lot: { include: { plantType: { select: { code: true, name: true } } } } } },
    },
  });
  if (!order) notFound();

  // Sale chỉ xem phiếu đơn của chính mình — Quản lý kho thành phẩm/Admin xem mọi đơn (giống phạm vi
  // /orders/list, xem isActingForSale ở đó).
  if (role === "SALE" && order.saleId !== session!.user.id) redirect("/orders/list");

  const manager = order.customerId && order.customer
    ? await getCustomerManager(order.saleId, order.customer.marketId)
    : null;

  const rows = groupForPrint(order.items);
  const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="po-page-wrap print:p-0">
        <div className="po-sheet">
          <header className="po-header">
            <h1 className="po-title">----- ĐƠN HÀNG -----</h1>
          </header>

          <section className="po-section">
            <div className="po-grid2">
              <div className="po-field">
                <span className="po-label">Ngày làm phiếu:</span>
                <span className="po-value">{format(new Date(), "dd/MM/yyyy")}</span>
              </div>
              <div className="po-field">
                <span className="po-label">Mã đơn xuất khẩu:</span>
                <span className="po-value">{order.exportCode || BLANK}</span>
              </div>
              <div className="po-field">
                <span className="po-label">Thị trường xuất:</span>
                <span className="po-value">{MARKET_LABELS[order.market]}</span>
              </div>
              <div className="po-field">
                <span className="po-label">Ngày xuất:</span>
                <span className="po-value">{order.expectedShipAt ? format(order.expectedShipAt, "dd/MM/yyyy") : BLANK}</span>
              </div>
              <div className="po-field">
                <span className="po-label">Tên nhân viên bán hàng:</span>
                <span className="po-value">{order.sale.name}</span>
              </div>
              <div className="po-field">
                <span className="po-label">Quản lý:</span>
                <span className="po-value">{manager?.name ?? BLANK}</span>
              </div>
            </div>
          </section>

          <section className="po-section">
            <h2 className="po-section-title">Bảng thông tin</h2>
            <table className="po-table">
              <thead>
                <tr>
                  <th style={{ width: "6%" }}>STT</th>
                  <th style={{ width: "12%" }}>Mã cây</th>
                  <th>Tên cây</th>
                  <th style={{ width: "12%" }}>Quy cách</th>
                  <th style={{ width: "16%" }}>Số lượng (cây)</th>
                  <th style={{ width: "20%" }}>Yêu cầu đặc biệt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.plantTypeCode}-${r.stageCode}`}>
                    <td>{i + 1}</td>
                    <td className="po-left">{r.plantTypeCode}</td>
                    <td className="po-left">{r.plantTypeName}</td>
                    <td>{r.stageCode}</td>
                    <td>{r.quantity.toLocaleString("vi-VN")}</td>
                    <td className="po-left">{r.notes || "—"}</td>
                  </tr>
                ))}
                <tr className="po-total">
                  <td className="po-left" colSpan={4}>Tổng số lượng</td>
                  <td colSpan={2}>{totalQuantity.toLocaleString("vi-VN")}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="po-section">
            <div className="po-sign-grid">
              <div className="po-sign-col">
                <p className="po-role">Người lập phiếu</p>
                <div className="po-sign-space" />
                <p className="po-hint">(Ký và ghi rõ họ tên)</p>
              </div>
              <div className="po-sign-col">
                <p className="po-role">NV kho xử lý</p>
                <div className="po-sign-space" />
                <p className="po-hint">(Ký và ghi rõ họ tên)</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="flex items-center gap-3 print:hidden">
        <Link href="/orders/list" className="print:hidden">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground font-mono">{order.code}</h1>
          <p className="text-text-secondary text-sm">Phiếu đơn hàng</p>
        </div>
        <PrintButton />
      </div>
    </div>
  );
}
