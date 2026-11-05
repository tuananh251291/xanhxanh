import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SupplierCheckError, deliverSupplierCheck, respondSupplierCheck } from "@/lib/supplier-check";

const schema = z.object({
  action: z.enum(["respond", "deliver"]),
  items: z.array(z.object({ id: z.string(), quantity: z.number().int().min(0) })),
});

// NCC chỉ thao tác được Đơn kiểm tra của chính mình.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "NHA_CUNG_CAP") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const check = await prisma.supplierCheck.findFirst({ where: { id, supplier: { userId: session.user.id } }, select: { id: true } });
  if (!check) return NextResponse.json({ message: "Không tìm thấy Đơn kiểm tra" }, { status: 404 });

  try {
    if (parsed.data.action === "respond") await respondSupplierCheck(id, parsed.data.items, { proxy: false });
    else await deliverSupplierCheck(id, parsed.data.items, { proxy: false });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SupplierCheckError) return NextResponse.json({ message: err.message }, { status: err.status });
    throw err;
  }
}
