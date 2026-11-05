import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { SupplierCheckError, canManageSupplierChecks, createSupplierCheck, sendSupplyResult } from "@/lib/supplier-check";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    orderId: z.string(),
    supplierId: z.string(),
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    items: z.array(z.object({ plantTypeId: z.string(), stageCode: z.string(), quantity: z.number().int().min(0) })).min(1),
  }),
  z.object({ action: z.literal("send-result"), orderId: z.string() }),
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canManageSupplierChecks(session.user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  try {
    if (parsed.data.action === "send-result") {
      await sendSupplyResult(parsed.data.orderId);
      return NextResponse.json({ success: true });
    }
    const { orderId, supplierId, deliveryDate, items } = parsed.data;
    const check = await createSupplierCheck({ orderId, supplierId, deliveryDateKey: deliveryDate, items, userId: session.user.id });
    return NextResponse.json(check, { status: 201 });
  } catch (err) {
    if (err instanceof SupplierCheckError) return NextResponse.json({ message: err.message }, { status: err.status });
    throw err;
  }
}
