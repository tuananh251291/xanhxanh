import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const schema = z.object({ action: z.enum(["confirm", "approve", "reject"]) });

// Kho mô xử lý đăng ký cấy thêm — chỉ được xử lý đúng NV cùng kho sản xuất mình đang làm việc (Admin/Admin
// cấp cao xử lý được mọi kho). EARLY_COMPLETION chỉ nhận action "confirm" (không có từ chối, xem
// ExtraWorkRequestStatus), OVERTIME chỉ nhận "approve"/"reject".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role;
  const { id } = await params;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { action } = parsed.data;

  const request = await prisma.extraWorkRequest.findUnique({
    where: { id },
    include: { staff: { select: { workplaceWarehouseId: true } } },
  });
  if (!request) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const canAct = isAdminRole(role) || (role === "KHO_MO" && !!session!.user.workplaceWarehouseId && session!.user.workplaceWarehouseId === request.staff.workplaceWarehouseId);
  if (!canAct) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  if (request.status !== "PENDING") {
    return NextResponse.json({ message: "Đăng ký này đã được xử lý" }, { status: 400 });
  }
  if (request.type === "EARLY_COMPLETION" && action !== "confirm") {
    return NextResponse.json({ message: "Chỉ có thể xác nhận đăng ký hoàn thành sớm" }, { status: 400 });
  }
  if (request.type === "OVERTIME" && action === "confirm") {
    return NextResponse.json({ message: "Đăng ký làm thêm ngoài giờ cần Đồng ý hoặc Từ chối" }, { status: 400 });
  }

  const updated = await prisma.extraWorkRequest.update({
    where: { id },
    data: {
      status: action === "reject" ? "REJECTED" : "APPROVED",
      respondedById: session!.user!.id,
      respondedAt: new Date(),
    },
  });

  return NextResponse.json(updated);
}
