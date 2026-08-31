import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getTaskMonth, getForecastStatus, applyForecastEntry } from "@/lib/rooting-forecast";
import { z } from "zod";

const itemSchema = z.object({
  plantTypeId: z.string().min(1),
  assignedStaffId: z.string().min(1),
  quantity: z.number().int().min(0),
});
const submitSchema = z.object({ items: z.array(itemSchema).min(1, "Cần điền ít nhất 1 dòng") });

// Nộp "Dự kiến đáp ứng cây ra rễ" LẦN ĐẦU (và DUY NHẤT) cho tháng hiện tại — tạo hết các dòng
// RootingForecastEntry rồi khoá lại bằng RootingForecastSubmission trong CÙNG 1 transaction (atomic: hoặc
// nộp trót lọt hết, hoặc không có gì được lưu). Gọi lại (khi đã khoá) trả 409 — muốn sửa sau khi khoá phải
// qua POST /api/rooting-forecast-edit-proposals.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Chỉ áp dụng cho NV Kỹ thuật" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) {
    return NextResponse.json({ message: "Chưa được Admin cấp cao gán cơ sở sản xuất" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { items } = parsed.data;

  const pairKeys = new Set(items.map((i) => `${i.plantTypeId}|${i.assignedStaffId}`));
  if (pairKeys.size !== items.length) {
    return NextResponse.json({ message: "Có 2 dòng trùng cùng mã cây + NV cấy mô — gộp lại thành 1 dòng trước khi lưu" }, { status: 400 });
  }

  const taskMonth = getTaskMonth();

  const existing = await prisma.rootingForecastSubmission.findUnique({ where: { warehouseId_taskMonth: { warehouseId, taskMonth } } });
  if (existing) {
    return NextResponse.json({ message: "Đã nộp rồi — không thể nộp lại, gửi Đề xuất chỉnh sửa nếu cần sửa" }, { status: 409 });
  }

  const [plantTypes, staffList] = await Promise.all([
    prisma.plantType.findMany({ where: { id: { in: items.map((i) => i.plantTypeId) }, isActive: true }, select: { id: true } }),
    prisma.user.findMany({ where: { id: { in: items.map((i) => i.assignedStaffId) }, role: "CAY_MO", isActive: true }, select: { id: true } }),
  ]);
  const validPlantTypeIds = new Set(plantTypes.map((p) => p.id));
  const validStaffIds = new Set(staffList.map((s) => s.id));
  const invalid = items.find((i) => !validPlantTypeIds.has(i.plantTypeId) || !validStaffIds.has(i.assignedStaffId));
  if (invalid) {
    return NextResponse.json({ message: "Có dòng chọn mã cây hoặc NV cấy mô không hợp lệ" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await applyForecastEntry(tx, { warehouseId, plantTypeId: item.plantTypeId, taskMonth, assignedStaffId: item.assignedStaffId, quantity: item.quantity, enteredById: session.user!.id });
    }
    await tx.rootingForecastSubmission.create({ data: { warehouseId, taskMonth, submittedById: session.user!.id } });
  });

  const status = await getForecastStatus(warehouseId, taskMonth);
  return NextResponse.json(status);
}
