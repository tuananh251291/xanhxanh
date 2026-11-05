import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SupplierCheckError, canManageSupplierChecks, deliverSupplierCheck, placeSupplierCheck, respondSupplierCheck } from "@/lib/supplier-check";

const items = z.array(z.object({ id: z.string(), quantity: z.number().int().min(0) }));
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("respond"), items }),
  z.object({ action: z.literal("deliver"), items }),
  z.object({ action: z.literal("place") }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageSupplierChecks(session.user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  try {
    if (parsed.data.action === "respond") await respondSupplierCheck(id, parsed.data.items, { proxy: true });
    else if (parsed.data.action === "deliver") await deliverSupplierCheck(id, parsed.data.items, { proxy: true });
    else {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { id: true, code: true, workplaceWarehouseId: true } });
      await placeSupplierCheck(id, user);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SupplierCheckError) return NextResponse.json({ message: err.message }, { status: err.status });
    throw err;
  }
}
