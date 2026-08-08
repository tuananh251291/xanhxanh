import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { findPendingItems, buildStagePreview } from "@/lib/receive-phong-toi";

// Kệ gợi ý (planShelfAssignments) cho ĐÚNG 1 NV luồng Xanh — tách khỏi GET /api/transfers/receive-phong-toi
// (danh sách, không tính kệ gợi ý nữa) để chỉ tính toán khi KHO_MO thật sự bấm vào trang "Sắp xếp vào
// kho" của NV đó, thay vì tính trước cho mọi NV mỗi lần tải danh sách — xem giải thích đầy đủ ở route.ts
// danh sách.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const { staffId } = await params;
  const staff = await prisma.user.findUnique({
    where: { id: staffId },
    select: { role: true, inspectionLane: true, workplaceWarehouseId: true },
  });
  if (!staff || staff.role !== "CAY_MO" || staff.inspectionLane !== "XANH" || staff.workplaceWarehouseId !== workplaceWarehouseId) {
    return NextResponse.json({ message: "Nhân viên không hợp lệ hoặc không thuộc luồng Xanh" }, { status: 400 });
  }

  const { items: pendingItems } = await findPendingItems(staffId);
  if (pendingItems.length === 0) return NextResponse.json(null);

  const preview = await buildStagePreview(pendingItems, workplaceWarehouseId);
  return NextResponse.json({ staffId, ...preview });
}
