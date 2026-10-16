import { prisma } from "@/lib/prisma";
import { getOrchidStock } from "@/lib/orchid/server";

// Danh sách chọn dùng lại ở nhiều form (server component truyền xuống client).

export async function getOrchidProductOptions() {
  const [products, stock] = await Promise.all([
    prisma.orchidProduct.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, unit: true, priceTiers: { orderBy: { minQuantity: "asc" }, select: { minQuantity: true, price: true } } },
    }),
    getOrchidStock(prisma),
  ]);
  return products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    basePrice: p.priceTiers[0]?.price ?? 0,
    priceTiers: p.priceTiers,
    available: stock.get(p.id)?.available ?? 0,
  }));
}
export type OrchidProductOption = Awaited<ReturnType<typeof getOrchidProductOptions>>[number];

export function getOrchidAccountOptions() {
  return prisma.orchidPaymentAccount.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, bankName: true, accountNumber: true },
  });
}
export type OrchidAccountOption = Awaited<ReturnType<typeof getOrchidAccountOptions>>[number];

export function getOrchidWarehouseOptions() {
  return prisma.orchidWarehouse.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });
}

export async function getOrchidOrderFormData() {
  const [customers, products, customerPrices] = await Promise.all([
    prisma.orchidCustomer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, address: true, phone: true, companyName: true, taxCode: true, invoiceAddress: true, invoiceEmail: true },
    }),
    getOrchidProductOptions(),
    prisma.orchidCustomerPrice.findMany({ select: { customerId: true, productId: true, price: true } }),
  ]);
  return { customers, products, customerPrices };
}
