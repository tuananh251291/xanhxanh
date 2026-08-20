import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { completeDarkRoomSubTask2ForWarehouse } from "@/lib/checklist";
import { startOfDay } from "date-fns";
import { z } from "zod";

// Danh sách NV cấy mô đang làm việc tại đúng kho của Kho mô — kèm đã "Kiểm tra xong" kho nhiễm cá nhân
// hôm nay chưa (xem PersonalContaminationCheck) — dùng cho mục "2. Kiểm tra kho nhiễm cá nhân" trong
// Kiểm tra kho tối (nhiệm vụ ngày).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json([]);

  const today = startOfDay(new Date());
  const [staff, checks] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CAY_MO", workplaceWarehouseId: warehouseId },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.personalContaminationCheck.findMany({
      where: { warehouseId, checkedDate: today },
      select: { staffId: true },
    }),
  ]);
  const checkedIds = new Set(checks.map((c) => c.staffId));

  return NextResponse.json(
    staff.map((s) => ({ staffId: s.id, staffCode: s.code, staffName: s.name, checked: checkedIds.has(s.id) }))
  );
}

const postSchema = z.object({ staffId: z.string() });

// "Kiểm tra xong" — Kho mô đánh dấu đã kiểm tra vật lý kho nhiễm cá nhân của 1 NV cấy mô hôm nay. Khi ĐỦ
// tất cả NV cấy mô của kho đã được đánh dấu, tự hoàn thành nhiệm vụ nhỏ tương ứng (xem
// completeDarkRoomSubTask2ForWarehouse).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Chỉ NV kho mô mới có quyền" }, { status: 403 });
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 403 });

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { staffId } = parsed.data;

  const staff = await prisma.user.findFirst({ where: { id: staffId, role: "CAY_MO", workplaceWarehouseId: warehouseId } });
  if (!staff) return NextResponse.json({ message: "Không tìm thấy NV cấy mô này ở đúng kho của bạn" }, { status: 404 });

  const today = startOfDay(new Date());
  await prisma.personalContaminationCheck.upsert({
    where: { staffId_checkedDate: { staffId, checkedDate: today } },
    create: { staffId, warehouseId, checkedDate: today, checkedById: session.user.id },
    update: {},
  });

  const [totalStaff, checkedCount] = await Promise.all([
    prisma.user.count({ where: { role: "CAY_MO", workplaceWarehouseId: warehouseId } }),
    prisma.personalContaminationCheck.count({ where: { warehouseId, checkedDate: today } }),
  ]);
  const allChecked = totalStaff > 0 && checkedCount >= totalStaff;
  if (allChecked) {
    await completeDarkRoomSubTask2ForWarehouse(warehouseId);
  }

  return NextResponse.json({ success: true, checkedCount, totalStaff, allChecked });
}
