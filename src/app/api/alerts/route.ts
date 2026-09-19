import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { alertTargetRolesFor, DEVIATION_CAUSE_LABELS } from "@/types";
import { createAlert, createAlertForWarehouseStaff } from "@/lib/inventory";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const unresolved = searchParams.get("unresolved");

  const where: Record<string, unknown> = {
    OR: [{ userId: session.user.id }, { targetRole: { in: alertTargetRolesFor(session.user.role) } }],
  };
  if (status) where.status = status;
  if (type) where.type = type;
  // Dùng cho trang "Kiểm tra tình trạng cấy" — liệt kê theo đã xác định nguyên nhân hay chưa,
  // tách biệt khỏi trạng thái đã xem (status) trên trang Thông báo.
  if (unresolved) where.cause = null;

  const alerts = await prisma.alert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(alerts);
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["READ", "RESOLVED"]),
  cause: z.enum(["KY_THUAT_SAI", "CAY_MO_SAI"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { id, status, cause } = parsed.data;

  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (alert.userId !== session.user.id && !(alert.targetRole && alertTargetRolesFor(session.user.role).includes(alert.targetRole))) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  // Alert lệch sản lượng bắt buộc chọn 1 trong 2 nguyên nhân trước khi được đánh dấu Đã xử lý.
  if (status === "RESOLVED" && alert.type === "OUTPUT_DEVIATION" && !cause) {
    return NextResponse.json({ message: "Cần chọn nguyên nhân trước khi xử lý" }, { status: 400 });
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: {
      status,
      readAt: alert.readAt ?? new Date(),
      ...(cause ? { cause } : {}),
    },
  });

  // NV Kỹ thuật vừa chọn xong nguyên nhân — báo kết quả cho ĐÚNG NV cấy mô bị đánh giá + NV Kho mô cùng
  // cơ sở (cùng warehouseId suy ra từ giàn kệ nguồn của chỉ định, khớp cách POST /api/daily-records đang
  // dùng cho MOTHER_CONTAMINATION_HIGH) — chỉ chạy đúng LẦN ĐẦU cause được ghi (alert.cause cũ null, nếu
  // không sẽ báo lại mỗi lần NV Kỹ thuật lỡ đổi ý chọn lại nguyên nhân khác cho alert đã resolved).
  if (cause && alert.type === "OUTPUT_DEVIATION" && alert.cause === null && alert.relatedId) {
    const instruction = await prisma.plantingInstruction.findUnique({
      where: { id: alert.relatedId },
      select: {
        code: true,
        assignedToId: true,
        items: { take: 1, select: { shelf: { select: { warehouseId: true } } } },
      },
    });
    if (instruction) {
      const warehouseId = instruction.items[0]?.shelf?.warehouseId ?? null;
      const message = `Chỉ định ${instruction.code} — kết luận: ${DEVIATION_CAUSE_LABELS[cause]}`;
      if (instruction.assignedToId) {
        await createAlert({
          type: "OUTPUT_DEVIATION_RESOLVED",
          title: "Kết quả đánh giá lệch sản lượng",
          message,
          userId: instruction.assignedToId,
          relatedId: alert.relatedId,
          relatedType: "PlantingInstruction",
        });
      }
      await createAlertForWarehouseStaff({
        role: "KHO_MO",
        warehouseId,
        type: "OUTPUT_DEVIATION_RESOLVED",
        title: "Kết quả đánh giá lệch sản lượng",
        message,
        relatedId: alert.relatedId,
        relatedType: "PlantingInstruction",
      });
    }
  }

  return NextResponse.json(updated);
}
