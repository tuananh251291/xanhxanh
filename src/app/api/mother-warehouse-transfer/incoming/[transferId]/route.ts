import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { confirmMotherStockReceipt } from "@/lib/mother-warehouse-transfer";
import { z } from "zod";

const confirmSchema = z.object({
  toShelfCode: z.string().trim().min(1).optional(),
  actualQuantity: z.number().int().min(0),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const { transferId } = await params;
  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  try {
    const result = await confirmMotherStockReceipt({
      transferId,
      ...parsed.data,
      workplaceWarehouseId,
      confirmedByUserId: session.user.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 409 });
    throw e;
  }
}
