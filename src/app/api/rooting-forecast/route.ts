import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getTaskMonth, getForecastStatus } from "@/lib/rooting-forecast";
import { z } from "zod";

// Nhiệm vụ tháng "Dự kiến đáp ứng cây ra rễ" — chỉ NV Kỹ thuật (KY_THUAT) đã được gán cơ sở sản xuất
// (workplaceWarehouseId) mới xem/điền được, đúng cơ sở của chính mình (không truyền warehouseId từ
// client). Xem src/lib/rooting-forecast.ts.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Chỉ áp dụng cho NV Kỹ thuật" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) {
    return NextResponse.json({ message: "Chưa được Admin cấp cao gán cơ sở sản xuất" }, { status: 400 });
  }

  const taskMonth = getTaskMonth();
  const status = await getForecastStatus(warehouseId, taskMonth);
  return NextResponse.json(status);
}

const patchSchema = z.object({
  plantTypeId: z.string().min(1),
  quantity: z.number().int().min(0),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Chỉ áp dụng cho NV Kỹ thuật" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) {
    return NextResponse.json({ message: "Chưa được Admin cấp cao gán cơ sở sản xuất" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { plantTypeId, quantity } = parsed.data;

  const taskMonth = getTaskMonth();
  await prisma.rootingForecastEntry.upsert({
    where: { warehouseId_plantTypeId_taskMonth: { warehouseId, plantTypeId, taskMonth } },
    create: { warehouseId, plantTypeId, taskMonth, quantity, enteredById: session.user.id },
    update: { quantity, enteredById: session.user.id, enteredAt: new Date() },
  });

  const status = await getForecastStatus(warehouseId, taskMonth);
  return NextResponse.json(status);
}
