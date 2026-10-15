import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const patchSchema = z.union([
  z.object({ confirmReceived: z.literal(true) }),
  z.object({
    handBack: z.object({
      items: z.array(z.object({ itemId: z.string().min(1), reportedQuantity: z.number().int().min(0) })).min(1),
      notes: z.string().optional(),
    }),
  }),
  z.object({
    confirm: z.object({
      items: z.array(z.object({ itemId: z.string().min(1), confirmedQuantity: z.number().int().min(0) })).min(1),
    }),
  }),
  z.object({ cancel: z.literal(true) }),
]);

async function loadTask(id: string) {
  return prisma.sealingTask.findUnique({
    where: { id },
    include: {
      warehouse: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, code: true } },
      items: { include: { plantType: { select: { id: true, code: true, name: true } } } },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Không có quyền" }, { status: 401 });

  const { id } = await params;
  const task = await loadTask(id);
  if (!task) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const role = session.user.role;
  if (role === "CAY_MO" && task.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (role === "KHO_MO" && task.warehouseId !== session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Không có quyền" }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const body = parsed.data;
  const role = session.user.role;

  const task = await loadTask(id);
  if (!task) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  // ---- NV cấy mô xác nhận "Nhận bàn giao" — giống bước xác nhận nhận mẫu mẹ của chỉ định cấy. Hàn túi
  // không đổi tồn (túi vẫn trên kệ Phòng ra rễ) — bước này chỉ đổi trạng thái. ----
  if ("confirmReceived" in body) {
    if (task.assignedToId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (task.status !== "ASSIGNED") {
      return NextResponse.json({ message: "Việc không ở trạng thái chờ xác nhận nhận" }, { status: 400 });
    }
    await prisma.sealingTask.update({ where: { id }, data: { staffConfirmedAt: new Date(), status: "IN_PROGRESS" } });
    return NextResponse.json({ success: true });
  }

  // ---- NV cấy mô tự khai kết quả cuối cùng — BẮT BUỘC đủ 100% số lượng đã giao mới bàn giao được
  // (không cho khai thiếu do hao hụt, khác trước đây) ----
  if ("handBack" in body) {
    if (task.assignedToId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (task.status !== "IN_PROGRESS") {
      return NextResponse.json({ message: "Việc không ở trạng thái đang xử lý" }, { status: 400 });
    }
    const { items: reportedItems, notes } = body.handBack;
    const itemById = new Map(task.items.map((i) => [i.id, i]));
    for (const ri of reportedItems) {
      const item = itemById.get(ri.itemId);
      if (!item) return NextResponse.json({ message: "Dòng việc không hợp lệ" }, { status: 400 });
      if (ri.reportedQuantity !== item.quantity) {
        return NextResponse.json({ message: `${item.plantType.name} ${item.stageCode}: cần hàn đủ ${item.quantity} đã giao mới được bàn giao` }, { status: 400 });
      }
    }
    if (reportedItems.length !== task.items.length) {
      return NextResponse.json({ message: "Cần khai đủ số lượng cho tất cả các dòng" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      for (const ri of reportedItems) {
        await tx.sealingTaskItem.update({ where: { id: ri.itemId }, data: { reportedQuantity: ri.reportedQuantity } });
      }
      await tx.sealingTask.update({
        where: { id },
        data: { staffHandedBackAt: new Date(), notes: notes ?? task.notes, status: "PENDING_RECEIPT" },
      });
    });
    return NextResponse.json({ success: true });
  }

  // ---- Kho mô (khu sản xuất) xác nhận số liệu thật — không đổi tồn ----
  if ("confirm" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    if (role === "KHO_MO" && task.warehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Việc không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (task.status !== "PENDING_RECEIPT") {
      return NextResponse.json({ message: "Việc không ở trạng thái chờ xác nhận" }, { status: 400 });
    }
    const { items: confirmedItems } = body.confirm;
    const itemById = new Map(task.items.map((i) => [i.id, i]));
    for (const ci of confirmedItems) {
      const item = itemById.get(ci.itemId);
      if (!item) return NextResponse.json({ message: "Dòng việc không hợp lệ" }, { status: 400 });
      if (ci.confirmedQuantity > item.quantity) {
        return NextResponse.json({ message: `${item.plantType.name} ${item.stageCode}: số lượng xác nhận không được vượt quá ${item.quantity} đã giao` }, { status: 400 });
      }
    }
    if (confirmedItems.length !== task.items.length) {
      return NextResponse.json({ message: "Cần xác nhận đủ số lượng cho tất cả các dòng" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      for (const ci of confirmedItems) {
        await tx.sealingTaskItem.update({ where: { id: ci.itemId }, data: { confirmedQuantity: ci.confirmedQuantity } });
      }
      await tx.sealingTask.update({
        where: { id },
        data: { confirmedAt: new Date(), confirmedById: session.user.id, status: "COMPLETED" },
      });
    });
    return NextResponse.json({ success: true });
  }

  // ---- Kho mô/Admin huỷ trước khi NV hoàn thành (ASSIGNED hoặc IN_PROGRESS) — không có tồn cần hoàn,
  // chỉ trả lại đăng ký làm thêm về "khả dụng". ----
  if ("cancel" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KHO_MO" && task.warehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Việc không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (task.status !== "ASSIGNED" && task.status !== "IN_PROGRESS") {
      return NextResponse.json({ message: "Chỉ huỷ được khi NV chưa bấm Hoàn thành" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.extraWorkRequest.updateMany({
        where: { fulfilledSealingTaskId: id },
        data: { fulfilledAt: null, fulfilledSealingTaskId: null },
      });
      await tx.sealingTask.update({ where: { id }, data: { status: "CANCELLED" } });
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
}
