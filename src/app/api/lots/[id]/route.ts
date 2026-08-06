import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

// Admin/Admin cấp cao sửa trực tiếp số lượng 1 lô đang có trên giàn kệ (trang "Kho & Kệ") — dùng khi số
// liệu thực tế lệch với hệ thống (kiểm kê, nhập sai...). CHỈ sửa `quantity` (số hiện có), KHÔNG đụng
// `initialQuantity` (giữ nguyên mốc ghi nhận gốc) — nhờ vậy các nơi khác vẫn tự nhận ra lô này "đã bị
// sửa khác bản gốc" (quantity !== initialQuantity, xem PATCH /api/daily-records/[id]) mà không cần thêm
// cờ riêng. Không chặn theo transferItems/inspectionItems/... như /api/daily-records/[id] — đây là công
// cụ Admin sửa trực tiếp, chủ động cho sửa mọi lô ACTIVE bất kể đã qua bàn giao/kiểm tra hay chưa.
const patchSchema = z.object({
  quantity: z.number().int().min(0),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Số lượng không hợp lệ" }, { status: 400 });

  const lot = await prisma.lot.findUnique({ where: { id }, select: { status: true } });
  if (!lot) return NextResponse.json({ message: "Không tìm thấy lô" }, { status: 404 });
  if (lot.status !== "ACTIVE") {
    return NextResponse.json({ message: "Chỉ sửa được lô đang hoạt động (ACTIVE)" }, { status: 400 });
  }

  const updated = await prisma.lot.update({
    where: { id },
    data: { quantity: parsed.data.quantity },
    select: { id: true, code: true, stageCode: true, quantity: true },
  });
  return NextResponse.json(updated);
}
