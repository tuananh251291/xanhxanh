import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendRndOutputToWarehouse } from "@/lib/rnd-warehouse-handover";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { z } from "zod";

// GET: danh sách MỌI kho thật khác (khu sản xuất lẫn kho thành phẩm) có thể chọn làm đích — xem
// sendRndOutputToWarehouse (src/lib/rnd-warehouse-handover.ts). Mã cây tự khai lấy từ
// GET /api/plant-types (tái dùng, không cần endpoint riêng).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const warehouses = await prisma.warehouse.findMany({
    where: { type: { in: ["SAN_XUAT", "THANH_PHAM"] }, isActive: true, isRnd: false },
    select: { id: true, code: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ warehouses });
}

const sendSchema = z.object({
  plantTypeId: z.string().min(1, "Cần chọn mã cây"),
  stageCode: z.enum(["M05", "T05", "T01"]),
  quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
  toWarehouseId: z.string().min(1, "Cần chọn kho đích"),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  try {
    const result = await sendRndOutputToWarehouse({
      plantTypeId: parsed.data.plantTypeId,
      stageCode: parsed.data.stageCode,
      quantity: parsed.data.quantity,
      toWarehouseId: parsed.data.toWarehouseId,
      fromUserId: session.user.id,
      notes: parsed.data.notes,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 400 });
    throw e;
  }
}
