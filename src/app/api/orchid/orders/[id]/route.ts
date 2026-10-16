import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, OrchidError, assertOrchidAvailable, parseDateVN } from "@/lib/orchid/server";
import { orchidOrderLineSchema } from "@/lib/orchid/schemas";
import {
  priceOrchidLines,
  replaceOrchidOrderItems,
  confirmOrchidOrder,
  prepareOrchidOrder,
  shipOrchidOrder,
  completeOrchidOrder,
  cancelOrchidOrder,
  returnOrchidOrder,
} from "@/lib/orchid/orders";

const optText = z.string().trim().max(5000).optional().nullable();

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    shippingAddress: optText,
    phone: optText,
    note: optText,
    internalNote: optText,
    needInvoice: z.boolean(),
    vatRate: z.number().min(0).max(100),
    items: z.array(orchidOrderLineSchema).min(1, "Đơn hàng cần ít nhất 1 sản phẩm"),
  }),
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("send_to_customer"), staffMessage: optText }),
  z.object({ action: z.literal("prepare") }),
  z.object({ action: z.literal("ship") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("cancel"), reason: optText }),
  z.object({ action: z.literal("return"), returns: z.array(z.object({ itemId: z.string(), quantity: z.number().int().min(0) })) }),
  z.object({
    action: z.literal("invoice"),
    needInvoice: z.boolean(),
    invoiceStatus: z.enum(["NOT_ISSUED", "PENDING", "ISSUED", "SENT"]),
    invoiceCompanyName: optText,
    invoiceTaxCode: optText,
    invoiceAddress: optText,
    invoiceEmail: optText,
    invoiceNumber: optText,
    invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
    invoiceNote: optText,
  }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const body = parsed.data;
  const isOrchidAdmin = guard.user.role === "ADMIN_HOA_LAN";

  return handleOrchidError(async () => {
    await prisma.$transaction(async (tx) => {
      const order = await tx.orchidOrder.findUniqueOrThrow({ where: { id } });
      switch (body.action) {
        case "update": {
          if (!["DRAFT", "PENDING_APPROVAL", "WAITING_CUSTOMER", "CONFIRMED"].includes(order.status)) {
            throw new OrchidError("Đơn đã xuất kho, không sửa được nữa");
          }
          const lines = await priceOrchidLines(tx, order.customerId, body.items);
          if (order.status === "CONFIRMED") await assertOrchidAvailable(tx, lines, order.id);
          await tx.orchidOrder.update({
            where: { id },
            data: { shippingAddress: body.shippingAddress, phone: body.phone, note: body.note, internalNote: body.internalNote, needInvoice: body.needInvoice },
          });
          await replaceOrchidOrderItems(tx, id, lines, body.vatRate);
          break;
        }
        case "confirm":
          await confirmOrchidOrder(tx, id, { allowedFrom: ["DRAFT", "PENDING_APPROVAL", "WAITING_CUSTOMER"], bypassCreditLimit: isOrchidAdmin });
          break;
        case "send_to_customer":
          if (!["DRAFT", "PENDING_APPROVAL"].includes(order.status)) throw new OrchidError("Chỉ gửi lại khách xác nhận khi đơn đang chờ duyệt/nháp");
          await tx.orchidOrder.update({ where: { id }, data: { status: "WAITING_CUSTOMER", staffMessage: body.staffMessage || null } });
          break;
        case "prepare":
          await prepareOrchidOrder(tx, id);
          break;
        case "ship":
          await shipOrchidOrder(tx, id);
          break;
        case "complete":
          await completeOrchidOrder(tx, id);
          break;
        case "cancel":
          await cancelOrchidOrder(tx, id, body.reason || null, ["DRAFT", "PENDING_APPROVAL", "WAITING_CUSTOMER", "CONFIRMED", "PREPARING"]);
          break;
        case "return":
          await returnOrchidOrder(tx, id, body.returns);
          break;
        case "invoice":
          await tx.orchidOrder.update({
            where: { id },
            data: {
              needInvoice: body.needInvoice,
              invoiceStatus: body.invoiceStatus,
              invoiceCompanyName: body.invoiceCompanyName || null,
              invoiceTaxCode: body.invoiceTaxCode || null,
              invoiceAddress: body.invoiceAddress || null,
              invoiceEmail: body.invoiceEmail || null,
              invoiceNumber: body.invoiceNumber || null,
              invoiceDate: body.invoiceDate ? parseDateVN(body.invoiceDate) : null,
              invoiceNote: body.invoiceNote || null,
              invoiceHandlerName: guard.user.name,
            },
          });
          break;
      }
    });
    return NextResponse.json({ success: true });
  });
}
