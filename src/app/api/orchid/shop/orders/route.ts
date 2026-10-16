import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidCustomer, badRequest, handleOrchidError, ORCHID_CODE, withCodeRetry, OrchidError } from "@/lib/orchid/server";
import { orchidShopOrderSchema } from "@/lib/orchid/schemas";
import { priceOrchidLines, replaceOrchidOrderItems } from "@/lib/orchid/orders";

// Khách hàng lan tự đặt hàng → Chờ duyệt. Trợ lý duyệt luôn hoặc sửa số lượng rồi gửi lại khách xác nhận.
// Không chặn theo tồn ở bước này (Trợ lý điều chỉnh khi duyệt); giá theo bảng giá của chính khách.
export async function POST(req: NextRequest) {
  const guard = await requireOrchidCustomer();
  if ("error" in guard) return guard.error;
  const parsed = orchidShopOrderSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { items, ...d } = parsed.data;
  const customer = guard.customer;

  return handleOrchidError(async () => {
    const order = await withCodeRetry(() =>
      prisma.$transaction(async (tx) => {
        const productIds = [...new Set(items.map((i) => i.productId))];
        const visible = await tx.orchidProduct.count({ where: { id: { in: productIds }, isActive: true, showToCustomer: true } });
        if (visible !== productIds.length) throw new OrchidError("Có sản phẩm không còn bán, vui lòng cập nhật giỏ hàng");
        const created = await tx.orchidOrder.create({
          data: {
            ...d,
            code: await ORCHID_CODE.order(tx),
            customerId: customer.id,
            status: "PENDING_APPROVAL",
            source: "CUSTOMER",
            createdById: guard.user.id,
            createdByName: guard.user.name,
            invoiceCompanyName: d.invoiceCompanyName || customer.companyName,
            invoiceTaxCode: d.invoiceTaxCode || customer.taxCode,
            invoiceAddress: d.invoiceAddress || customer.invoiceAddress,
            invoiceEmail: d.invoiceEmail || customer.invoiceEmail,
          },
        });
        const lines = await priceOrchidLines(tx, customer.id, items);
        await replaceOrchidOrderItems(tx, created.id, lines, 0, true);
        return created;
      })
    );
    return NextResponse.json(order, { status: 201 });
  });
}
