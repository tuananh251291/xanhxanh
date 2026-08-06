import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

class InsufficientStockError extends Error {}

async function loadInstruction(id: string) {
  return prisma.repackInstruction.findUnique({
    where: { id },
    include: {
      plantType: { select: { id: true, code: true, name: true } },
      sourceShelf: { select: { id: true, code: true, name: true, warehouseId: true, warehouse: { select: { name: true, code: true } } } },
      sourceLot: { select: { id: true, code: true, quantity: true, stageCode: true } },
      createdBy: { select: { id: true, name: true, code: true } },
      assignedTo: { select: { id: true, name: true, code: true, workplaceWarehouseId: true } },
      assignedBy: { select: { name: true, code: true } },
      khoMoInspectedBy: { select: { name: true, code: true } },
      placedBy: { select: { name: true, code: true } },
      actualOutputShelf: { select: { code: true } },
      outputLot: { select: { code: true, quantity: true } },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Không có quyền" }, { status: 401 });

  const { id } = await params;
  const instruction = await loadInstruction(id);
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });

  const role = session.user.role;
  if (role === "CAY_MO" && instruction.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (role === "KY_THUAT" && instruction.createdById !== session.user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (role === "KHO_MO" && instruction.sourceShelf.warehouseId !== session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  return NextResponse.json(instruction);
}

const patchSchema = z.union([
  z.object({ assignedToId: z.string().min(1) }),
  z.object({ confirmReceived: z.literal(true) }),
  z.object({ reportInsufficientQuantity: z.object({ note: z.string().optional() }) }),
  z.object({ undoConfirmReceived: z.literal(true) }),
  z.object({
    handBack: z.object({
      reportedPassedQuantity: z.number().int().min(0),
      reportedFailedQuantity: z.number().int().min(0),
      notes: z.string().optional(),
    }),
  }),
  z.object({
    inspect: z.object({
      confirmedPassedQuantity: z.number().int().min(0),
      confirmedFailedQuantity: z.number().int().min(0),
    }),
  }),
  z.object({ cancel: z.literal(true) }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Không có quyền" }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const body = parsed.data;
  const role = session.user.role;

  const instruction = await loadInstruction(id);
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });

  // ---- KHO_MO chọn NV cấy mô thực hiện — mirror nhánh assignedToId "kệ chung" của PlantingInstruction ----
  if ("assignedToId" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KHO_MO" && instruction.sourceShelf.warehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (instruction.status !== "CREATED") {
      return NextResponse.json({ message: "Chỉ định đã được gán NV hoặc không còn ở trạng thái chờ gán" }, { status: 400 });
    }
    const staff = await prisma.user.findUnique({
      where: { id: body.assignedToId },
      select: { role: true, isActive: true, workplaceWarehouseId: true },
    });
    if (!staff || staff.role !== "CAY_MO" || !staff.isActive || staff.workplaceWarehouseId !== instruction.sourceShelf.warehouseId) {
      return NextResponse.json({ message: "Nhân viên cấy mô không hợp lệ cho kho này" }, { status: 400 });
    }
    const updated = await prisma.repackInstruction.update({
      where: { id },
      data: { assignedToId: body.assignedToId, assignedById: session.user.id, assignedAt: new Date(), status: "ASSIGNED" },
    });
    return NextResponse.json(updated);
  }

  // ---- NV cấy mô tự xác nhận "Nhận bàn giao" — TRỪ TỒN KHO ngay tại đây ----
  if ("confirmReceived" in body) {
    if (instruction.assignedToId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (instruction.status !== "ASSIGNED") {
      return NextResponse.json({ message: "Chỉ định không ở trạng thái chờ nhận bàn giao" }, { status: 400 });
    }
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const sourceLot = await tx.lot.findUnique({ where: { id: instruction.sourceLotId }, select: { quantity: true } });
        if (!sourceLot || sourceLot.quantity < instruction.inputQuantity) {
          throw new InsufficientStockError(
            `Lô nguồn không còn đủ số lượng (còn ${sourceLot?.quantity ?? 0}, cần ${instruction.inputQuantity})`
          );
        }
        await tx.lot.update({ where: { id: instruction.sourceLotId }, data: { quantity: { decrement: instruction.inputQuantity } } });
        return tx.repackInstruction.update({
          where: { id },
          data: { staffConfirmedAt: new Date(), status: "IN_PROGRESS" },
        });
      });
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return NextResponse.json({ message: err.message }, { status: 409 });
      }
      throw err;
    }
  }

  // ---- NV cấy mô báo "Số lượng không đủ" thay vì "Nhận bàn giao" — số cây thực tế trên kệ không khớp
  // inputQuantity của chỉ định. KHÔNG trừ tồn kho (chưa từng xác nhận nhận) — chỉ đưa chỉ định về lại
  // CREATED (huỷ gán, Kho mô cần kiểm tra lại kệ trước khi gán lại) + báo cho đúng Kho mô đã gán biết.
  if ("reportInsufficientQuantity" in body) {
    if (instruction.assignedToId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (instruction.status !== "ASSIGNED") {
      return NextResponse.json({ message: "Chỉ định không ở trạng thái chờ nhận bàn giao" }, { status: 400 });
    }
    const { note } = body.reportInsufficientQuantity;
    const updated = await prisma.repackInstruction.update({
      where: { id },
      data: {
        quantityIssueReportedAt: new Date(),
        quantityIssueReportedById: session.user.id,
        quantityIssueNote: note,
        assignedToId: null,
        assignedById: null,
        assignedAt: null,
        status: "CREATED",
      },
    });
    if (instruction.assignedById) {
      await createAlert({
        type: "REPACK_QUANTITY_MISMATCH",
        title: "Chỉ định cấy xử lý báo số lượng không đủ",
        message: `${session.user.name} báo số lượng thực tế trên kệ ${instruction.sourceShelf.code} không khớp chỉ định ${instruction.code} (cần ${instruction.inputQuantity} ${instruction.inputStageCode})${note ? ` — ghi chú: ${note}` : ""} — cần kiểm tra lại trước khi gán NV khác.`,
        userId: instruction.assignedById,
        relatedId: instruction.id,
        relatedType: "RepackInstruction",
      });
    }
    return NextResponse.json(updated);
  }

  // ---- Kho mô/Admin hoàn tác "Nhận bàn giao" — HOÀN LẠI TỒN KHO ----
  if ("undoConfirmReceived" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KHO_MO" && instruction.sourceShelf.warehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (!instruction.staffConfirmedAt || instruction.staffHandedBackAt) {
      return NextResponse.json({ message: "Chỉ hoàn tác được khi NV đã nhận bàn giao nhưng chưa bàn giao kết quả" }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.lot.update({ where: { id: instruction.sourceLotId }, data: { quantity: { increment: instruction.inputQuantity } } });
      return tx.repackInstruction.update({
        where: { id },
        data: { staffConfirmedAt: null, status: "ASSIGNED" },
      });
    });
    return NextResponse.json(updated);
  }

  // ---- NV cấy mô bàn giao kết quả cuối cùng (đạt/không đạt tự khai) ----
  if ("handBack" in body) {
    if (instruction.assignedToId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (instruction.status !== "IN_PROGRESS") {
      return NextResponse.json({ message: "Chỉ định không ở trạng thái đang xử lý" }, { status: 400 });
    }
    const { reportedPassedQuantity, reportedFailedQuantity, notes } = body.handBack;
    if (reportedPassedQuantity + reportedFailedQuantity > instruction.expectedOutputQuantity) {
      return NextResponse.json({ message: "Tổng số đạt + không đạt vượt quá số lượng dự kiến đầu ra" }, { status: 400 });
    }
    const updated = await prisma.repackInstruction.update({
      where: { id },
      data: {
        reportedPassedQuantity,
        reportedFailedQuantity,
        staffHandedBackAt: new Date(),
        notes: notes ?? instruction.notes,
        status: "PENDING_PLACEMENT",
      },
    });
    return NextResponse.json(updated);
  }

  // ---- Kho mô kiểm tra lại kết quả (giống mức độ review của chỉ định cấy bình thường) ----
  if ("inspect" in body) {
    if (role !== "KHO_MO" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KHO_MO" && instruction.sourceShelf.warehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (instruction.status !== "PENDING_PLACEMENT") {
      return NextResponse.json({ message: "Chỉ định không ở trạng thái chờ kiểm tra" }, { status: 400 });
    }
    const { confirmedPassedQuantity, confirmedFailedQuantity } = body.inspect;
    if (confirmedPassedQuantity + confirmedFailedQuantity > instruction.expectedOutputQuantity) {
      return NextResponse.json({ message: "Tổng số đạt + không đạt vượt quá số lượng dự kiến đầu ra" }, { status: 400 });
    }
    const updated = await prisma.repackInstruction.update({
      where: { id },
      data: {
        confirmedPassedQuantity,
        confirmedFailedQuantity,
        creditedQuantity: confirmedPassedQuantity,
        khoMoInspectedAt: new Date(),
        khoMoInspectedById: session.user.id,
      },
    });
    return NextResponse.json(updated);
  }

  // ---- KY_THUAT/Admin hủy chỉ định — chỉ khi chưa trừ tồn kho ----
  if ("cancel" in body) {
    if (role !== "KY_THUAT" && !isAdminRole(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (role === "KY_THUAT" && instruction.createdById !== session.user.id) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    if (instruction.staffConfirmedAt) {
      return NextResponse.json({ message: "NV đã nhận bàn giao (đã trừ tồn kho) — không thể hủy nữa" }, { status: 400 });
    }
    if (instruction.status === "CANCELLED" || instruction.status === "COMPLETED") {
      return NextResponse.json({ message: "Chỉ định đã kết thúc" }, { status: 400 });
    }
    const updated = await prisma.repackInstruction.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
}
