import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { confirmRndOutputReceipt } from "@/lib/rnd-warehouse-handover";
import { z } from "zod";

const confirmSchema = z.object({
  toShelfCode: z.string().trim().min(1, "Cần chọn giàn đích"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const { transferId } = await params;
  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  try {
    const result = await confirmRndOutputReceipt({
      transferId,
      toShelfCode: parsed.data.toShelfCode,
      workplaceWarehouseId,
      confirmedByUserId: session.user.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 409 });
    throw e;
  }
}
