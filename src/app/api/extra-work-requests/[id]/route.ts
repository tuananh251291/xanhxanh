import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { createAlert } from "@/lib/inventory";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { z } from "zod";

const schema = z.object({ action: z.enum(["confirm", "approve", "reject"]) });

// Kho mô xử lý đăng ký cấy thêm — chỉ được xử lý đúng NV cùng kho sản xuất mình đang làm việc (Admin/Admin
// cấp cao xử lý được mọi kho). EARLY_COMPLETION nhận action "confirm" (duyệt) hoặc "reject" (từ chối),
// OVERTIME nhận "approve"/"reject" — cả 2 loại đều từ chối được, chỉ khác tên action lúc duyệt.
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
    include: {
      staff: { select: { workplaceWarehouseId: true, name: true } },
      instruction: { select: { code: true } },
    },
  });
  if (!request) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const canAct = isAdminRole(role) || (role === "KHO_MO" && !!session!.user.workplaceWarehouseId && session!.user.workplaceWarehouseId === request.staff.workplaceWarehouseId);
  if (!canAct) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  if (request.status !== "PENDING") {
    return NextResponse.json({ message: "Đăng ký này đã được xử lý" }, { status: 400 });
  }
  if (request.type === "EARLY_COMPLETION" && action !== "confirm" && action !== "reject") {
    return NextResponse.json({ message: "Đăng ký hoàn thành sớm chỉ có thể Xác nhận hoặc Từ chối" }, { status: 400 });
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

  // Báo cho đúng NV cấy mô đã gửi đăng ký biết bị từ chối — duyệt thì NV tự thấy qua danh sách của mình,
  // không cần báo riêng, nhưng từ chối là kết quả bất ngờ nên cần chủ động thông báo.
  if (action === "reject") {
    const reasonDetail =
      request.type === "EARLY_COMPLETION"
        ? `hoàn thành sớm chỉ định ${request.instruction?.code ?? ""}`
        : "làm thêm ngoài giờ";
    try {
      await createAlert({
        type: "EXTRA_WORK_REQUEST_REJECTED",
        title: "Đăng ký cấy thêm bị từ chối",
        message: `Đăng ký ${reasonDetail} của bạn đã bị từ chối (${format(new Date(), "HH:mm dd/MM/yyyy", { locale: vi })}).`,
        userId: request.staffId,
        relatedId: request.id,
        relatedType: "ExtraWorkRequest",
      });
    } catch (err) {
      console.error(`[extra-work-requests/${id}] Không gửi được thông báo từ chối:`, err);
    }
  }

  return NextResponse.json(updated);
}
