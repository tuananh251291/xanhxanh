import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrchidCustomer, badRequest, handleOrchidError, OrchidError } from "@/lib/orchid/server";
import { confirmOrchidOrder, cancelOrchidOrder } from "@/lib/orchid/orders";

const schema = z.object({ action: z.enum(["accept", "reject", "cancel"]), message: z.string().max(2000).optional().nullable() });

// Khách xác nhận / từ chối đơn Trợ lý đã điều chỉnh, hoặc tự huỷ đơn đang chờ duyệt.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidCustomer();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return badRequest("Dữ liệu không hợp lệ");
  const { action, message } = parsed.data;

  return handleOrchidError(async () => {
    await prisma.$transaction(async (tx) => {
      const order = await tx.orchidOrder.findUnique({ where: { id } });
      if (!order || order.customerId !== guard.customer.id) throw new OrchidError("Không tìm thấy đơn hàng");
      if (message) await tx.orchidOrder.update({ where: { id }, data: { customerMessage: message } });
      if (action === "accept") await confirmOrchidOrder(tx, id, { allowedFrom: ["WAITING_CUSTOMER"] });
      else if (action === "reject") await cancelOrchidOrder(tx, id, message || "Khách từ chối đơn đã điều chỉnh", ["WAITING_CUSTOMER"]);
      else await cancelOrchidOrder(tx, id, message || "Khách tự huỷ", ["PENDING_APPROVAL"]);
    });
    return NextResponse.json({ success: true });
  });
}
