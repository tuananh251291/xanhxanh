import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canAccessOrchidAdmin, canManageOrchidAdminOnly } from "@/types";
import { ORCHID_DELIVERED_STATUSES, ORCHID_RESERVING_STATUSES } from "@/lib/orchid/labels";

type Client = Prisma.TransactionClient | typeof prisma;

// ============================================================
// Xác thực theo vai trò — trả { session } hoặc { error: NextResponse } để route return thẳng.
// ============================================================

type OrchidSession = { id: string; name: string; role: string };

async function currentUser(): Promise<OrchidSession | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.status !== "APPROVED") return null;
  return { id: session.user.id, name: session.user.name ?? "", role: session.user.role ?? "" };
}

function forbidden(message = "Không có quyền") {
  return { error: NextResponse.json({ message }, { status: 403 }) } as const;
}

// Admin cấp cao + NV Trợ lý.
export async function requireOrchidStaff() {
  const user = await currentUser();
  if (!user || !canAccessOrchidAdmin(user.role as never)) return forbidden();
  return { user } as const;
}

// Chỉ Admin cấp cao (Chi phí, Báo cáo, Cấu hình hệ thống).
export async function requireOrchidSuperAdmin() {
  const user = await currentUser();
  if (!user || !canManageOrchidAdminOnly(user.role as never)) return forbidden("Chỉ Admin cấp cao mới có quyền này");
  return { user } as const;
}

export async function requireOrchidCustomer() {
  const user = await currentUser();
  if (!user || user.role !== "KHACH_HANG_LAN") return forbidden();
  const customer = await prisma.orchidCustomer.findUnique({ where: { userId: user.id } });
  if (!customer || !customer.isActive) return forbidden("Tài khoản chưa được gắn với khách hàng nào");
  return { user, customer } as const;
}

export async function requireOrchidPoint() {
  const user = await currentUser();
  if (!user || user.role !== "DIEM_BAN_LAN") return forbidden();
  const point = await prisma.orchidRetailPoint.findUnique({ where: { userId: user.id } });
  if (!point) return forbidden("Tài khoản chưa được gắn với điểm bán nào");
  return { user, point } as const;
}

export function badRequest(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

// Lỗi nghiệp vụ ném ra trong transaction — route bắt lại trả 400 với đúng message.
export class OrchidError extends Error {}

export async function handleOrchidError(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof OrchidError) return badRequest(e.message);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return badRequest("Mã hoặc email đã tồn tại, vui lòng kiểm tra lại");
    }
    throw e;
  }
}

// ============================================================
// Sinh mã — PREFIX + số thứ tự tăng dần (VD DH26100001). Gọi trong transaction để đọc thấy mã vừa tạo.
// ============================================================

type CodeDelegate = {
  findFirst: (args: { where: { code: { startsWith: string } }; orderBy: { code: "desc" }; select: { code: true } }) => Promise<{ code: string } | null>;
};

export type OrchidCodeModel =
  | "orchidProduct" | "orchidSupplier" | "orchidCustomer" | "orchidGoodsReceipt" | "orchidLot" | "orchidOrder"
  | "orchidCustomerPayment" | "orchidSupplierPayment" | "orchidExpense" | "orchidRetailPoint" | "orchidTransfer";

function yyMM(date = new Date()): string {
  const s = date.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // yyyy-MM-dd
  return s.slice(2, 4) + s.slice(5, 7);
}

export async function nextOrchidCode(client: Client, model: OrchidCodeModel, prefix: string, pad: number): Promise<string> {
  const delegate = (client as unknown as Record<string, CodeDelegate>)[model];
  const last = await delegate.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" }, select: { code: true } });
  const lastSeq = last ? parseInt(last.code.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(pad, "0")}`;
}

export const ORCHID_CODE = {
  order: (c: Client) => nextOrchidCode(c, "orchidOrder", `DH${yyMM()}`, 4),
  receipt: (c: Client) => nextOrchidCode(c, "orchidGoodsReceipt", `PN${yyMM()}`, 3),
  lot: (c: Client) => nextOrchidCode(c, "orchidLot", `L${yyMM().slice(0, 2)}`, 3),
  customerPayment: (c: Client) => nextOrchidCode(c, "orchidCustomerPayment", `PT${yyMM()}`, 4),
  supplierPayment: (c: Client) => nextOrchidCode(c, "orchidSupplierPayment", `TT${yyMM()}`, 4),
  expense: (c: Client) => nextOrchidCode(c, "orchidExpense", `CP${yyMM()}`, 4),
  transfer: (c: Client) => nextOrchidCode(c, "orchidTransfer", `DC${yyMM()}`, 3),
  product: (c: Client) => nextOrchidCode(c, "orchidProduct", "SP", 3),
  supplier: (c: Client) => nextOrchidCode(c, "orchidSupplier", "NCCL", 2),
  customer: (c: Client) => nextOrchidCode(c, "orchidCustomer", "KHL", 3),
  point: (c: Client) => nextOrchidCode(c, "orchidRetailPoint", "DB", 2),
};

// Chạy lại khi 2 request đồng thời sinh trùng mã (P2002) — tối đa 3 lần.
export async function withCodeRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const isDup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!isDup || attempt >= 2) throw e;
    }
  }
}

// ============================================================
// Tồn kho
// ============================================================

export type OrchidStock = { remaining: number; reserved: number; available: number };

// remaining = Σ lô còn; reserved = SL trong đơn đã xác nhận nhưng chưa xuất lô; available = remaining − reserved.
export async function getOrchidStock(client: Client, productIds?: string[], excludeOrderId?: string): Promise<Map<string, OrchidStock>> {
  const productFilter = productIds ? { productId: { in: productIds } } : {};
  const [lots, reservedItems] = await Promise.all([
    client.orchidLot.groupBy({ by: ["productId"], where: { ...productFilter, quantityRemaining: { gt: 0 } }, _sum: { quantityRemaining: true } }),
    client.orchidOrderItem.groupBy({
      by: ["productId"],
      where: {
        ...productFilter,
        order: { status: { in: ORCHID_RESERVING_STATUSES }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) },
      },
      _sum: { quantity: true },
    }),
  ]);
  const map = new Map<string, OrchidStock>();
  for (const l of lots) {
    const remaining = l._sum.quantityRemaining ?? 0;
    map.set(l.productId, { remaining, reserved: 0, available: remaining });
  }
  for (const r of reservedItems) {
    const s = map.get(r.productId) ?? { remaining: 0, reserved: 0, available: 0 };
    s.reserved = r._sum.quantity ?? 0;
    s.available = s.remaining - s.reserved;
    map.set(r.productId, s);
  }
  return map;
}

// Kiểm tra đủ tồn khả dụng cho danh sách {productId, quantity} (gộp theo sản phẩm).
export async function assertOrchidAvailable(
  client: Client,
  lines: { productId: string; quantity: number }[],
  excludeOrderId?: string
): Promise<void> {
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.productId, (need.get(l.productId) ?? 0) + l.quantity);
  const stock = await getOrchidStock(client, [...need.keys()], excludeOrderId);
  const products = await client.orchidProduct.findMany({ where: { id: { in: [...need.keys()] } }, select: { id: true, name: true } });
  for (const [productId, qty] of need) {
    const available = stock.get(productId)?.available ?? 0;
    if (qty > available) {
      const name = products.find((p) => p.id === productId)?.name ?? productId;
      throw new OrchidError(`"${name}" chỉ còn ${available} cây khả dụng (cần ${qty})`);
    }
  }
}

// Trừ tồn FIFO theo ngày nhập — trả về danh sách lô đã lấy. updateMany có điều kiện quantityRemaining >= take
// để 2 giao dịch đồng thời không trừ âm cùng 1 lô.
export async function allocateOrchidFifo(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number
): Promise<{ lotId: string; quantity: number }[]> {
  const lots = await tx.orchidLot.findMany({
    where: { productId, quantityRemaining: { gt: 0 } },
    orderBy: [{ receivedDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, quantityRemaining: true },
  });
  const result: { lotId: string; quantity: number }[] = [];
  let left = quantity;
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.quantityRemaining);
    const updated = await tx.orchidLot.updateMany({
      where: { id: lot.id, quantityRemaining: { gte: take } },
      data: { quantityRemaining: { decrement: take } },
    });
    if (updated.count !== 1) throw new OrchidError("Tồn kho vừa thay đổi, vui lòng thử lại");
    result.push({ lotId: lot.id, quantity: take });
    left -= take;
  }
  if (left > 0) {
    const product = await tx.orchidProduct.findUnique({ where: { id: productId }, select: { name: true } });
    throw new OrchidError(`Không đủ tồn kho "${product?.name ?? productId}" (thiếu ${left} cây)`);
  }
  return result;
}

// ============================================================
// Công nợ khách hàng
// ============================================================

export type LedgerEntry = { date: Date; content: string; debit: number; credit: number; balance: number; ref?: string };

type DeliveredOrder = { id: string; code: string; total: number; returnedAmount: number; shippedAt: Date | null; returnedAt: Date | null; dueDate: Date | null };
type Payment = { id: string; code: string; amount: number; paymentDate: Date; orderId: string | null; method: string; note: string | null };

function buildLedger(orders: DeliveredOrder[], payments: Payment[]): LedgerEntry[] {
  const raw: Omit<LedgerEntry, "balance">[] = [];
  for (const o of orders) {
    raw.push({ date: o.shippedAt ?? new Date(0), content: `Đơn ${o.code}`, debit: o.total, credit: 0, ref: o.id });
    if (o.returnedAmount > 0) raw.push({ date: o.returnedAt ?? o.shippedAt ?? new Date(0), content: `Trả hàng đơn ${o.code}`, debit: 0, credit: o.returnedAmount, ref: o.id });
  }
  for (const p of payments) {
    raw.push({ date: p.paymentDate, content: `Thanh toán ${p.code}${p.method === "CASH" ? " (tiền mặt)" : " (chuyển khoản)"}${p.note ? ` — ${p.note}` : ""}`, debit: 0, credit: p.amount });
  }
  raw.sort((a, b) => a.date.getTime() - b.date.getTime());
  let balance = 0;
  return raw.map((e) => {
    balance += e.debit - e.credit;
    return { ...e, balance };
  });
}

// Phân bổ thanh toán vào từng chứng từ: thanh toán có gắn chứng từ trừ vào đúng chứng từ đó trước, phần còn lại
// trừ FIFO theo ngày — dùng để tính "Quá hạn" (phần chưa trả của chứng từ đã qua hạn).
function allocatePayments<T extends { id: string; amount: number; date: Date; dueDate: Date | null }>(
  docs: T[],
  payments: { amount: number; docId: string | null }[]
): Map<string, number> {
  const unpaid = new Map(docs.map((d) => [d.id, d.amount]));
  let pool = 0;
  for (const p of payments) {
    if (p.docId && unpaid.has(p.docId)) {
      const left = unpaid.get(p.docId)!;
      const use = Math.min(left, p.amount);
      unpaid.set(p.docId, left - use);
      pool += p.amount - use;
    } else pool += p.amount;
  }
  for (const d of [...docs].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    if (pool <= 0) break;
    const left = unpaid.get(d.id)!;
    const use = Math.min(left, pool);
    unpaid.set(d.id, left - use);
    pool -= use;
  }
  return unpaid;
}

export type DebtSummary = {
  totalReceivable: number;
  paid: number;
  outstanding: number;
  overdue: number;
  nextDueDate: Date | null;
};

export async function getOrchidCustomerDebt(client: Client, customerId: string) {
  const [orders, payments] = await Promise.all([
    client.orchidOrder.findMany({
      where: { customerId, status: { in: ORCHID_DELIVERED_STATUSES } },
      select: { id: true, code: true, total: true, returnedAmount: true, shippedAt: true, returnedAt: true, dueDate: true },
    }),
    client.orchidCustomerPayment.findMany({
      where: { customerId },
      select: { id: true, code: true, amount: true, paymentDate: true, orderId: true, method: true, note: true },
    }),
  ]);
  const ledger = buildLedger(orders, payments);
  const summary = summarizeDebt(
    orders.map((o) => ({ id: o.id, amount: o.total - o.returnedAmount, date: o.shippedAt ?? new Date(0), dueDate: o.dueDate })),
    payments.map((p) => ({ amount: p.amount, docId: p.orderId }))
  );
  return { ledger, summary, orders };
}

function summarizeDebt(
  docs: { id: string; amount: number; date: Date; dueDate: Date | null }[],
  payments: { amount: number; docId: string | null }[]
): DebtSummary & { unpaidByDoc: Map<string, number> } {
  const totalReceivable = docs.reduce((s, d) => s + d.amount, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const unpaidByDoc = allocatePayments(docs, payments);
  const now = Date.now();
  let overdue = 0;
  let nextDueDate: Date | null = null;
  for (const d of docs) {
    const left = unpaidByDoc.get(d.id) ?? 0;
    if (left <= 0.5) continue;
    if (d.dueDate && d.dueDate.getTime() < now) overdue += left;
    else if (d.dueDate && (!nextDueDate || d.dueDate < nextDueDate)) nextDueDate = d.dueDate;
  }
  return { totalReceivable, paid, outstanding: totalReceivable - paid, overdue, nextDueDate, unpaidByDoc };
}

// Tổng hợp công nợ mọi khách (1 lần query, không N+1) — dùng ở danh sách khách / Công nợ / Dashboard.
export async function getAllOrchidCustomerDebts(client: Client): Promise<Map<string, DebtSummary>> {
  const [orders, payments] = await Promise.all([
    client.orchidOrder.findMany({
      where: { status: { in: ORCHID_DELIVERED_STATUSES } },
      select: { id: true, customerId: true, total: true, returnedAmount: true, shippedAt: true, dueDate: true },
    }),
    client.orchidCustomerPayment.findMany({ select: { customerId: true, amount: true, orderId: true } }),
  ]);
  const ids = new Set([...orders.map((o) => o.customerId), ...payments.map((p) => p.customerId)]);
  const result = new Map<string, DebtSummary>();
  for (const id of ids) {
    const s = summarizeDebt(
      orders.filter((o) => o.customerId === id).map((o) => ({ id: o.id, amount: o.total - o.returnedAmount, date: o.shippedAt ?? new Date(0), dueDate: o.dueDate })),
      payments.filter((p) => p.customerId === id).map((p) => ({ amount: p.amount, docId: p.orderId }))
    );
    result.set(id, { totalReceivable: s.totalReceivable, paid: s.paid, outstanding: s.outstanding, overdue: s.overdue, nextDueDate: s.nextDueDate });
  }
  return result;
}

// ============================================================
// Công nợ nhà cung cấp — phát sinh theo phiếu nhập (totalAmount), trả theo OrchidSupplierPayment.
// ============================================================

export async function getAllOrchidSupplierDebts(client: Client): Promise<Map<string, DebtSummary>> {
  const [receipts, payments] = await Promise.all([
    client.orchidGoodsReceipt.findMany({ where: { supplierId: { not: null } }, select: { id: true, supplierId: true, totalAmount: true, receiptDate: true, dueDate: true } }),
    client.orchidSupplierPayment.findMany({ select: { supplierId: true, amount: true, receiptId: true } }),
  ]);
  const ids = new Set([...receipts.map((r) => r.supplierId!), ...payments.map((p) => p.supplierId)]);
  const result = new Map<string, DebtSummary>();
  for (const id of ids) {
    const s = summarizeDebt(
      receipts.filter((r) => r.supplierId === id).map((r) => ({ id: r.id, amount: r.totalAmount, date: r.receiptDate, dueDate: r.dueDate })),
      payments.filter((p) => p.supplierId === id).map((p) => ({ amount: p.amount, docId: p.receiptId }))
    );
    result.set(id, { totalReceivable: s.totalReceivable, paid: s.paid, outstanding: s.outstanding, overdue: s.overdue, nextDueDate: s.nextDueDate });
  }
  return result;
}

export async function getOrchidSupplierLedger(client: Client, supplierId: string) {
  const [receipts, payments] = await Promise.all([
    client.orchidGoodsReceipt.findMany({ where: { supplierId }, select: { id: true, code: true, totalAmount: true, receiptDate: true, dueDate: true } }),
    client.orchidSupplierPayment.findMany({ where: { supplierId }, select: { id: true, code: true, amount: true, paymentDate: true, receiptId: true, method: true, note: true } }),
  ]);
  const raw: Omit<LedgerEntry, "balance">[] = [
    ...receipts.map((r) => ({ date: r.receiptDate, content: `Phiếu nhập ${r.code}`, debit: r.totalAmount, credit: 0, ref: r.id })),
    ...payments.map((p) => ({ date: p.paymentDate, content: `Trả tiền ${p.code}${p.note ? ` — ${p.note}` : ""}`, debit: 0, credit: p.amount })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  let balance = 0;
  const ledger = raw.map((e) => ({ ...e, balance: (balance += e.debit - e.credit) }));
  const summary = summarizeDebt(
    receipts.map((r) => ({ id: r.id, amount: r.totalAmount, date: r.receiptDate, dueDate: r.dueDate })),
    payments.map((p) => ({ amount: p.amount, docId: p.receiptId }))
  );
  return { ledger, summary, receipts };
}

// ============================================================
// Điểm bán lẻ — chỉ theo tổng số cây.
// ============================================================

export type PointSummary = {
  received: number; // đã nhận từ kho trung tâm
  returned: number; // đã trả về kho trung tâm
  sold: number;
  damaged: number;
  expectedStock: number; // tồn sổ sách = nhận − trả − bán − hỏng
  pendingIncoming: number; // hàng đang gửi, điểm chưa xác nhận nhận
  revenue: number;
  paid: number; // đã nộp tiền về
  debt: number;
  lastReport: { reportDate: Date; remainingQuantity: number; expectedAtReport: number } | null;
  mismatch: boolean; // Nhận ≠ Bán + Hỏng + Tồn (+ Trả) theo số điểm báo gần nhất
};

export async function getOrchidPointSummaries(client: Client, pointIds?: string[]): Promise<Map<string, PointSummary>> {
  const pf = pointIds ? { pointId: { in: pointIds } } : {};
  const [transfers, sales, damages, reports, payments] = await Promise.all([
    client.orchidTransfer.findMany({ where: { ...pf, status: { in: ["PENDING", "RECEIVED"] } }, select: { pointId: true, type: true, status: true, quantity: true, receivedQuantity: true, receivedAt: true } }),
    client.orchidRetailSale.findMany({ where: pf, select: { pointId: true, quantity: true, revenue: true, createdAt: true } }),
    client.orchidRetailDamage.findMany({ where: pf, select: { pointId: true, quantity: true, createdAt: true } }),
    client.orchidRetailStockReport.findMany({ where: pf, orderBy: { createdAt: "desc" }, select: { pointId: true, reportDate: true, remainingQuantity: true, createdAt: true } }),
    client.orchidRetailPayment.findMany({ where: pf, select: { pointId: true, amount: true } }),
  ]);
  const ids = pointIds ?? [...new Set([...transfers, ...sales, ...damages, ...reports, ...payments].map((x) => x.pointId))];
  const result = new Map<string, PointSummary>();
  for (const id of ids) {
    const t = transfers.filter((x) => x.pointId === id);
    const received = t.filter((x) => x.type === "TO_POINT" && x.status === "RECEIVED").reduce((s, x) => s + (x.receivedQuantity ?? x.quantity), 0);
    const returned = t.filter((x) => x.type === "FROM_POINT" && x.status === "RECEIVED").reduce((s, x) => s + x.quantity, 0);
    const pendingIncoming = t.filter((x) => x.type === "TO_POINT" && x.status === "PENDING").reduce((s, x) => s + x.quantity, 0);
    const ps = sales.filter((x) => x.pointId === id);
    const pd = damages.filter((x) => x.pointId === id);
    const sold = ps.reduce((s, x) => s + x.quantity, 0);
    const damaged = pd.reduce((s, x) => s + x.quantity, 0);
    const revenue = ps.reduce((s, x) => s + x.revenue, 0);
    const paid = payments.filter((x) => x.pointId === id).reduce((s, x) => s + x.amount, 0);
    const expectedStock = received - returned - sold - damaged;

    const report = reports.find((r) => r.pointId === id);
    let lastReport: PointSummary["lastReport"] = null;
    if (report) {
      const at = report.createdAt.getTime();
      const recAt = t.filter((x) => x.type === "TO_POINT" && x.status === "RECEIVED" && x.receivedAt && x.receivedAt.getTime() <= at).reduce((s, x) => s + (x.receivedQuantity ?? x.quantity), 0);
      const retAt = t.filter((x) => x.type === "FROM_POINT" && x.status === "RECEIVED" && x.receivedAt && x.receivedAt.getTime() <= at).reduce((s, x) => s + x.quantity, 0);
      const soldAt = ps.filter((x) => x.createdAt.getTime() <= at).reduce((s, x) => s + x.quantity, 0);
      const dmgAt = pd.filter((x) => x.createdAt.getTime() <= at).reduce((s, x) => s + x.quantity, 0);
      lastReport = { reportDate: report.reportDate, remainingQuantity: report.remainingQuantity, expectedAtReport: recAt - retAt - soldAt - dmgAt };
    }
    result.set(id, {
      received, returned, sold, damaged, expectedStock, pendingIncoming, revenue, paid, debt: revenue - paid, lastReport,
      mismatch: !!lastReport && lastReport.remainingQuantity !== lastReport.expectedAtReport,
    });
  }
  return result;
}

// Ngày "yyyy-MM-dd" (input date) → Date 00:00 giờ Việt Nam.
export function parseDateVN(value: string): Date {
  return new Date(`${value}T00:00:00+07:00`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
