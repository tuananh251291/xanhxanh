import { prisma } from "@/lib/prisma";
import { canViewAllInvoices } from "@/lib/invoice";
import type { InvoiceFormCustomer, InvoiceFormMarket, InvoiceFormOrder, InvoiceFormProfile } from "./invoice-form";

// Dữ liệu chọn cho form invoice: khách mình phụ trách (Quản lý kho TP / Admin cấp cao: mọi khách đã phân công),
// đơn đang giữ của mình (lập hộ: mọi đơn đang giữ), thị trường đang hoạt động, mẫu thông tin công ty.
export async function loadInvoiceFormData(user: { id: string; role: string | null | undefined }) {
  const all = canViewAllInvoices(user.role);
  const [markets, customers, orders, profiles] = await Promise.all([
    prisma.market.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, currency: true, derivedCurrency: true } }),
    prisma.customer.findMany({
      where: all ? { assignedToId: { not: null } } : { assignedToId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, marketId: true, email: true },
    }),
    prisma.order.findMany({
      where: { status: { in: ["HELD", "DRAFT"] }, marketWarehouseId: null, ...(all ? {} : { saleId: user.id }) },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, code: true, customerId: true, customerCode: true, items: { select: { quantity: true, neededQuantity: true } } },
    }),
    prisma.companyProfile.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return {
    markets: markets as InvoiceFormMarket[],
    customers: customers as InvoiceFormCustomer[],
    orders: orders.map((o): InvoiceFormOrder => ({
      id: o.id, code: o.code, customerId: o.customerId, customerCode: o.customerCode,
      plants: o.items.reduce((a, i) => a + (i.neededQuantity ?? i.quantity), 0),
    })),
    profiles: profiles.map((p): InvoiceFormProfile => ({ id: p.id, name: p.name, address: p.address, email: p.email, phone: p.phone, taxCode: p.taxCode, bankInfo: p.bankInfo })),
  };
}

export const vnToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
