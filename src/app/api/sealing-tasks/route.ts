import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { generateSealingTaskCode } from "@/lib/codes";
import { z } from "zod";

const createSchema = z.object({
  extraWorkRequestId: z.string().min(1),
  items: z.array(z.object({
    plantTypeId: z.string().min(1),
    stageCode: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1, "Cần chọn ít nhất 1 loại cây"),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const where: Record<string, unknown> = {};
  // Cho phép truyền nhiều trạng thái cách nhau dấu phẩy (VD "ASSIGNED,IN_PROGRESS") — panel NV cấy mô
  // cần gộp 2 nhóm "chờ xác nhận nhận" + "đang làm" trong 1 lần gọi.
  if (status) where.status = status.includes(",") ? { in: status.split(",") } : status;

  if (role === "CAY_MO") {
    where.assignedToId = session.user.id;
  } else if (role === "KHO_MO") {
    // Hàn túi giờ là việc của Khu sản xuất — Kho mô thấy mọi việc hàn túi của đúng kho mình làm việc.
    where.warehouseId = session.user.workplaceWarehouseId ?? "__none__";
  } else if (!isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const tasks = await prisma.sealingTask.findMany({
    where,
    include: {
      warehouse: { select: { name: true, code: true } },
      assignedTo: { select: { name: true, code: true } },
      assignedBy: { select: { name: true, code: true } },
      confirmedBy: { select: { name: true } },
      items: { include: { plantType: { select: { code: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(tasks);
}

// Kho mô "Giao việc hàn túi" từ 1 đăng ký làm thêm/hoàn thành sớm ĐÃ DUYỆT và CHƯA dùng (giống hệt cơ
// chế assignExtraWorkRequestId của chỉ định cấy dự phòng/xử lý). Hàn túi là việc của KHU SẢN XUẤT (Kho
// thành phẩm không còn Phòng theo dõi/hàn túi): hàn túi thành phẩm đang nằm trên kệ Phòng ra rễ của đúng
// kho NV làm việc — chỉ kiểm tra số lượng không vượt tồn, KHÔNG chuyển/trừ tồn (túi vẫn trên kệ). Tạo ở
// status ASSIGNED — NV cấy mô xác nhận "Nhận bàn giao", hàn xong bàn giao kết quả, Kho mô xác nhận.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (role !== "KHO_MO" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { extraWorkRequestId, items } = parsed.data;

  const extraWorkRequest = await prisma.extraWorkRequest.findUnique({
    where: { id: extraWorkRequestId },
    include: { staff: { select: { id: true, role: true, isActive: true, workplaceWarehouseId: true } } },
  });
  if (!extraWorkRequest) return NextResponse.json({ message: "Không tìm thấy đăng ký" }, { status: 404 });
  if (role === "KHO_MO" && extraWorkRequest.staff.workplaceWarehouseId !== session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Đăng ký không thuộc kho bạn làm việc" }, { status: 403 });
  }
  if (!extraWorkRequest.staff.isActive || extraWorkRequest.staff.role !== "CAY_MO") {
    return NextResponse.json({ message: "Nhân viên cấy mô không hợp lệ" }, { status: 400 });
  }
  if (extraWorkRequest.status !== "APPROVED" || extraWorkRequest.fulfilledAt) {
    return NextResponse.json({ message: "Đăng ký này chưa được duyệt hoặc đã dùng cho việc khác" }, { status: 400 });
  }

  const warehouseId = extraWorkRequest.staff.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "NV cấy mô chưa được gán khu sản xuất" }, { status: 400 });

  // Chặn trùng lặp trong CÙNG 1 lần giao việc — 2 dòng cùng (plantTypeId, stageCode) sẽ cùng khớp 1 Lot
  // nguồn, dễ tính sai tồn nếu không gộp trước khi validate/trừ.
  const dedupedKeys = new Set(items.map((i) => `${i.plantTypeId}:${i.stageCode}`));
  if (dedupedKeys.size !== items.length) {
    return NextResponse.json({ message: "Mỗi loại cây/quy cách chỉ được chọn 1 dòng" }, { status: 400 });
  }

  for (const item of items) {
    const agg = await prisma.lot.aggregate({
      where: {
        plantTypeId: item.plantTypeId, stageCode: item.stageCode, status: "ACTIVE", stage: "THANH_PHAM",
        shelf: { warehouseId, room: { type: "PHONG_RA_RE" } },
      },
      _sum: { quantity: true },
    });
    const available = agg._sum.quantity ?? 0;
    if (available < item.quantity) {
      const plantType = await prisma.plantType.findUnique({ where: { id: item.plantTypeId }, select: { name: true } });
      return NextResponse.json(
        { message: `${plantType?.name ?? "Loại cây"} ${item.stageCode}: Phòng ra rễ chỉ còn ${available}, không đủ ${item.quantity}` },
        { status: 409 }
      );
    }
  }

  {
    const task = await prisma.$transaction(async (tx) => {
      const code = await generateSealingTaskCode(tx);
      const created = await tx.sealingTask.create({
        data: {
          code,
          warehouseId,
          assignedToId: extraWorkRequest.staffId,
          assignedById: session.user.id,
          items: { create: items.map((i) => ({ plantTypeId: i.plantTypeId, stageCode: i.stageCode, quantity: i.quantity })) },
        },
        include: { items: { include: { plantType: { select: { code: true, name: true } } } } },
      });

      await tx.extraWorkRequest.update({
        where: { id: extraWorkRequest.id },
        data: { fulfilledAt: new Date(), fulfilledSealingTaskId: created.id },
      });

      return created;
    });

    return NextResponse.json(task, { status: 201 });
  }
}
