import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// "Xác nhận" — Nhân viên sản xuất xác nhận đã nhận phiếu "Bàn giao cây trồng" (đúng kho mình đang làm
// việc) — chỉ khi CẢ 2 bước (Kho mô bàn giao + NV sản xuất xác nhận) mới tính hoàn thành nhiệm vụ tuần
// tương ứng (xem dashboard/page.tsx + lib/task-completion-report.ts).
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "NHAN_VIEN_SAN_XUAT") {
    return NextResponse.json({ message: "Chỉ NV sản xuất mới có quyền xác nhận" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 403 });

  const { id } = await params;
  const handover = await prisma.replantHandover.findUnique({ where: { id } });
  if (!handover || handover.warehouseId !== warehouseId) {
    return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });
  }
  if (handover.status !== "PENDING") {
    return NextResponse.json({ message: "Phiếu đã được xác nhận trước đó" }, { status: 400 });
  }

  const updated = await prisma.replantHandover.update({
    where: { id },
    data: { status: "CONFIRMED", confirmedById: session.user.id, confirmedAt: new Date() },
  });

  return NextResponse.json(updated);
}
