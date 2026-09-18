import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";

// Danh sách đánh giá — dùng cho cả màn "Đánh giá chất lượng cây ra rễ" (KY_THUAT, lọc status=PENDING,
// chỉ thấy việc của chính mình) lẫn trang báo cáo lịch sử (KHO_MO/KY_THUAT/Admin, thường lọc
// status=COMPLETED). KY_THUAT chỉ thấy đánh giá được giao cho MÌNH; KHO_MO chỉ thấy đúng kho mình đang
// làm việc; Admin thấy tất cả.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const where: Record<string, unknown> = status ? { status } : {};
  if (role === "KY_THUAT") {
    where.assignedToId = session.user.id;
  } else if (role === "KHO_MO") {
    if (!session.user.workplaceWarehouseId) return NextResponse.json([]);
    where.warehouseId = session.user.workplaceWarehouseId;
  } else if (!isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const evaluations = await prisma.rootingQualityEvaluation.findMany({
    where,
    select: {
      id: true, code: true, status: true, weekStart: true, reason: true, completedAt: true, createdAt: true,
      warehouse: { select: { code: true, name: true } },
      room: { select: { name: true } },
      rotationGroup: { select: { name: true } },
      assignedTo: { select: { name: true, code: true } },
      items: {
        select: { stageCode: true, totalQuantity: true, passedQuantity: true, failedQuantity: true, plantType: { select: { code: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(evaluations);
}
