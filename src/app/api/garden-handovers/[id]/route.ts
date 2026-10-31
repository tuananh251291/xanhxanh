import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isGardenAdmin } from "@/types";
import { z } from "zod";

const schema = z.object({ action: z.literal("confirm") });

// Quản lý vườn (ProductionGarden.manager) hoặc Admin xác nhận đã nhận cây của 1 phiếu "Bàn giao về Vườn sản
// xuất" (xem GardenHandover). Tồn đã trừ khỏi Phòng chờ xử lý từ lúc Quản lý kho thành phẩm gửi đề xuất —
// bước này chỉ chốt trạng thái, không đổi tồn.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Không có quyền" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { id } = await params;
  const handover = await prisma.gardenHandover.findUnique({
    where: { id },
    select: { id: true, status: true, productionGarden: { select: { managerId: true } } },
  });
  if (!handover) return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });
  const isManager = handover.productionGarden.managerId === session.user.id;
  if (!isManager && !isGardenAdmin(session.user.role)) {
    return NextResponse.json({ message: "Chỉ Quản lý vườn nhận cây mới xác nhận được" }, { status: 403 });
  }
  if (handover.status !== "PENDING") return NextResponse.json({ message: "Phiếu đã được xác nhận" }, { status: 400 });

  const updated = await prisma.gardenHandover.update({
    where: { id },
    data: { status: "CONFIRMED", confirmedById: session.user.id, confirmedAt: new Date() },
  });
  return NextResponse.json(updated);
}
