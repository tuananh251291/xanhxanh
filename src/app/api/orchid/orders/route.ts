import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, ORCHID_CODE, withCodeRetry } from "@/lib/orchid/server";
import { orchidOrderSchema } from "@/lib/orchid/schemas";
import { priceOrchidLines, replaceOrchidOrderItems, confirmOrchidOrder } from "@/lib/orchid/orders";

// Admin cấp cao/NV Trợ lý tạo đơn cho khách — lưu nháp hoặc chốt luôn (confirm = true).
export async function POST(req: NextRequest) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const parsed = orchidOrderSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { items, confirm, ...d } = parsed.data;

  return handleOrchidError(async () => {
    const order = await withCodeRetry(() =>
      prisma.$transaction(async (tx) => {
        const customer = await tx.orchidCustomer.findUniqueOrThrow({ where: { id: d.customerId } });
        const created = await tx.orchidOrder.create({
          data: {
            ...d,
            code: await ORCHID_CODE.order(tx),
            source: "STAFF",
            createdById: guard.user.id,
            createdByName: guard.user.name,
            shippingAddress: d.shippingAddress || customer.address,
            phone: d.phone || customer.phone,
            invoiceCompanyName: d.invoiceCompanyName || customer.companyName,
            invoiceTaxCode: d.invoiceTaxCode || customer.taxCode,
            invoiceAddress: d.invoiceAddress || customer.invoiceAddress,
            invoiceEmail: d.invoiceEmail || customer.invoiceEmail,
          },
        });
        const lines = await priceOrchidLines(tx, d.customerId, items);
        await replaceOrchidOrderItems(tx, created.id, lines, d.vatRate, true);
        if (confirm) await confirmOrchidOrder(tx, created.id, { allowedFrom: ["DRAFT"], bypassCreditLimit: guard.user.role === "SUPER_ADMIN" });
        return created;
      })
    );
    return NextResponse.json(order, { status: 201 });
  });
}
