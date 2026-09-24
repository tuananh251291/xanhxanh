import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";

// Danh sách đánh giá thử việc — CAY_MO chỉ thấy của chính mình (mọi trạng thái); KY_THUAT chỉ thấy phiếu
// của NV cùng workplaceWarehouseId đang chờ MÌNH chấm (status=PENDING_MANAGER) hoặc đã do mình chấm
// trước đó (managerId=mình); Admin/Hành chính nhân sự thấy tất cả (dùng cho báo cáo).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const where: Record<string, unknown> = status ? { status } : {};
  if (role === "CAY_MO") {
    where.staffId = session.user.id;
  } else if (role === "KY_THUAT") {
    if (!session.user.workplaceWarehouseId) return NextResponse.json([]);
    where.staff = { workplaceWarehouseId: session.user.workplaceWarehouseId };
    where.OR = [{ status: "PENDING_MANAGER" }, { managerId: session.user.id }];
  } else if (!isAdminRole(role) && role !== "HANH_CHINH_NHAN_SU") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const evaluations = await prisma.probationEvaluation.findMany({
    where,
    select: {
      id: true, code: true, weekNumber: true, weekStart: true, weekEnd: true, status: true,
      // managerComment thêm cho báo cáo Hành chính nhân sự — trước đây chỉ trả %+kết quả, HR phải bấm vào
      // từng tuần mới thấy được nhận xét cụ thể của NV Kỹ thuật (xem probation-evaluation-report-board.tsx).
      managerPercent: true, result: true, createdAt: true, managerComment: true,
      staff: { select: { name: true, code: true, workplaceWarehouse: { select: { name: true } } } },
      manager: { select: { name: true, code: true } },
    },
    orderBy: [{ staffId: "asc" }, { weekNumber: "asc" }],
    take: 300,
  });

  return NextResponse.json(evaluations);
}
