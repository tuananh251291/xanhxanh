import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { generateSealingTaskCode } from "@/lib/codes";
import { z } from "zod";

class InsufficientStockError extends Error {}

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
  if (status) where.status = status;

  if (role === "CAY_MO") {
    where.assignedToId = session.user.id;
  } else if (role === "KHO_THANH_PHAM" || role === "QUAN_LY_KHO_THANH_PHAM") {
    // NV/Quản lý kho thành phẩm chỉ thấy việc hàn túi của ĐÚNG kho mình (Phòng hàn túi đích) — dùng
    // workplaceWarehouseId nếu có, không thì trả rỗng thay vì lộ dữ liệu.
    where.warehouseId = session.user.workplaceWarehouseId ?? "__none__";
  } else if (role === "KHO_MO") {
    where.assignedById = session.user.id;
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
// chế assignExtraWorkRequestId của chỉ định cấy dự phòng/xử lý) — khác 2 luồng đó ở chỗ TRỪ TỒN NGAY
// khỏi Phòng theo dõi của Kho thành phẩm (không đợi NV xác nhận nhận), vì đây là việc XUYÊN kho, không
// có khái niệm "kệ nguồn" để giữ chỗ như RepackInstruction.
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

  const warehouse = await prisma.warehouse.findFirst({ where: { type: "THANH_PHAM", isActive: true }, select: { id: true } });
  if (!warehouse) return NextResponse.json({ message: "Chưa có Kho thành phẩm nào trong hệ thống" }, { status: 400 });
  const theoDoiRoom = await prisma.room.findFirst({ where: { warehouseId: warehouse.id, type: "PHONG_THEO_DOI", isActive: true }, select: { id: true } });
  if (!theoDoiRoom) return NextResponse.json({ message: "Kho thành phẩm thiếu Phòng theo dõi" }, { status: 400 });

  // Chặn trùng lặp trong CÙNG 1 lần giao việc — 2 dòng cùng (plantTypeId, stageCode) sẽ cùng khớp 1 Lot
  // nguồn, dễ tính sai tồn nếu không gộp trước khi validate/trừ.
  const dedupedKeys = new Set(items.map((i) => `${i.plantTypeId}:${i.stageCode}`));
  if (dedupedKeys.size !== items.length) {
    return NextResponse.json({ message: "Mỗi loại cây/quy cách chỉ được chọn 1 dòng" }, { status: 400 });
  }

  try {
    const task = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const lot = await tx.lot.findFirst({
          where: { roomId: theoDoiRoom.id, plantTypeId: item.plantTypeId, stageCode: item.stageCode, status: "ACTIVE" },
          select: { id: true, quantity: true },
        });
        if (!lot || lot.quantity < item.quantity) {
          const plantType = await tx.plantType.findUnique({ where: { id: item.plantTypeId }, select: { name: true } });
          throw new InsufficientStockError(
            `${plantType?.name ?? "Loại cây"} ${item.stageCode}: Phòng theo dõi chỉ còn ${lot?.quantity ?? 0}, không đủ ${item.quantity}`
          );
        }
        await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: item.quantity } } });
      }

      const code = await generateSealingTaskCode(tx);
      const created = await tx.sealingTask.create({
        data: {
          code,
          warehouseId: warehouse.id,
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
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return NextResponse.json({ message: err.message }, { status: 409 });
    }
    throw err;
  }
}
